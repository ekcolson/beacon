import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../bootstrap.dart';
import 'beacon_service.dart';
import 'push_service.dart';

const _lastCodeKey = 'last_beacon_code';

class BeaconPage extends StatefulWidget {
  const BeaconPage({super.key, required this.bootstrap});

  final BootstrapResult bootstrap;

  @override
  State<BeaconPage> createState() => _BeaconPageState();
}

class _BeaconPageState extends State<BeaconPage> {
  final BeaconService _service = BeaconService();
  final PushService _push = PushService();
  final TextEditingController _codeController = TextEditingController();

  StreamSubscription<BeaconEvent>? _subscription;

  /// Server-normalized id for the code we're currently watching; null means we
  /// haven't joined anything yet.
  String? _beaconId;

  /// The beacon this device's push token is registered against, which is not
  /// always [_beaconId]: registration is skipped when push is unavailable, and
  /// it outlives the widget so pushes still arrive while the app is closed.
  String? _registeredBeaconId;

  final List<BeaconEvent> _events = [];

  bool _joining = false;
  bool _lighting = false;
  String? _error;

  /// Mirrors the server's `normalizeCode`, only to decide which button to show.
  String get _typedBeaconId => _codeController.text.trim().toUpperCase();

  bool get _typedMatchesJoined =>
      _beaconId != null && _typedBeaconId == _beaconId;

  @override
  void initState() {
    super.initState();
    _codeController.addListener(_onCodeChanged);
    _restoreLastCode();
  }

  @override
  void dispose() {
    // Deliberately no unregister here: closing the app should not stop pushes.
    _subscription?.cancel();
    _codeController
      ..removeListener(_onCodeChanged)
      ..dispose();
    super.dispose();
  }

  void _onCodeChanged() => setState(() {});

  Future<void> _restoreLastCode() async {
    if (!widget.bootstrap.backendReady) return;

    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_lastCodeKey);
    if (code == null || code.isEmpty || !mounted) return;

    _codeController.text = code;
    await _join(code);
  }

  /// Joining is what makes this device a *recipient*: it registers the push
  /// token and opens the realtime subscription. Lighting is a separate step.
  ///
  /// Switching codes routes through here too, so the previous beacon is always
  /// left behind first.
  Future<void> _join(String rawCode) async {
    final code = rawCode.trim();
    if (code.isEmpty || _joining) return;

    setState(() {
      _joining = true;
      _error = null;
    });

    try {
      await _leaveCurrent();

      final beaconId = await _service.joinBeacon(code);
      _subscription = _service.subscribe(beaconId).listen(
            _onEvent,
            onError: (Object e) {
              if (mounted) setState(() => _error = '$e');
            },
          );

      final token = await _push.requestToken();
      if (token != null) {
        await _service.registerDevice(
          beaconId: beaconId,
          pushToken: token,
          platform: _push.platform!,
        );
        _registeredBeaconId = beaconId;
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastCodeKey, beaconId);

      if (!mounted) return;
      setState(() {
        _beaconId = beaconId;
        _events.clear();
        // Show the normalized form the server actually joined us to.
        _codeController.text = beaconId;
      });
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  /// Drops the realtime subscription and stops push for whichever beacon this
  /// device is currently registered against.
  Future<void> _leaveCurrent() async {
    await _subscription?.cancel();
    _subscription = null;

    final registered = _registeredBeaconId;
    if (registered == null) return;

    try {
      await _service.unregisterDevice(beaconId: registered);
      _registeredBeaconId = null;
    } on Exception catch (e) {
      // Not worth blocking the switch: if this fails the old beacon keeps
      // pushing until its token dies and the fan-out Lambda prunes it.
      debugPrint('Could not unregister from $registered: $e');
    }
  }

  Future<void> _light() async {
    final beaconId = _beaconId;
    if (beaconId == null || _lighting) return;

    setState(() {
      _lighting = true;
      _error = null;
    });

    try {
      await _service.sendBeacon(beaconId);
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _lighting = false);
    }
  }

  void _onEvent(BeaconEvent event) {
    if (!mounted) return;
    setState(() => _events.insert(0, event));
  }

  Future<void> _leave() async {
    await _leaveCurrent();
    if (!mounted) return;
    setState(() {
      _beaconId = null;
      _events.clear();
      _error = null;
      _codeController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final joined = _beaconId != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Light the Beacon')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (widget.bootstrap.warning != null)
                  _Banner(message: widget.bootstrap.warning!),
                TextField(
                  controller: _codeController,
                  // Stays editable while joined: typing a new code and
                  // submitting is how you move to another beacon.
                  enabled: widget.bootstrap.backendReady && !_joining,
                  textCapitalization: TextCapitalization.characters,
                  textInputAction: TextInputAction.go,
                  decoration: InputDecoration(
                    labelText: 'Beacon code',
                    hintText: 'Enter a shared code',
                    border: const OutlineInputBorder(),
                    suffixIcon: joined
                        ? IconButton(
                            icon: const Icon(Icons.close),
                            tooltip: 'Leave beacon',
                            onPressed: _joining ? null : _leave,
                          )
                        : null,
                  ),
                  onSubmitted: _join,
                ),
                const SizedBox(height: 12),
                // Lighting a code you have typed but not joined would be a lie,
                // so an edited field turns the button back into a join action.
                if (!_typedMatchesJoined)
                  FilledButton(
                    onPressed: widget.bootstrap.backendReady &&
                            !_joining &&
                            _typedBeaconId.isNotEmpty
                        ? () => _join(_codeController.text)
                        : null,
                    child: Text(
                      _joining
                          ? 'Joining...'
                          : joined
                              ? 'Switch to $_typedBeaconId'
                              : 'Join beacon',
                    ),
                  )
                else ...[
                  Text(
                    'Watching $_beaconId',
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _lighting ? null : _light,
                    icon: const Icon(Icons.local_fire_department),
                    label: Text(_lighting ? 'Lighting...' : 'Light the Beacon'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 18),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: TextStyle(color: theme.colorScheme.error),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 24),
                Expanded(child: _EventList(events: _events, joined: joined)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EventList extends StatelessWidget {
  const _EventList({required this.events, required this.joined});

  final List<BeaconEvent> events;
  final bool joined;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (!joined) {
      return Center(
        child: Text(
          'Enter a code to start watching a beacon.',
          style: theme.textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      );
    }
    if (events.isEmpty) {
      return Center(
        child: Text('No beacons lit yet.', style: theme.textTheme.bodySmall),
      );
    }

    return ListView.builder(
      itemCount: events.length,
      itemBuilder: (context, index) {
        final event = events[index];
        return ListTile(
          leading: const Icon(Icons.local_fire_department),
          title: const Text('Beacon lit'),
          subtitle: Text(event.pressedAt.toLocal().toString()),
        );
      },
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(message, style: theme.textTheme.bodySmall),
    );
  }
}
