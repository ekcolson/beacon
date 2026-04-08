import 'package:flutter/material.dart';

import '../../config/env.dart';
import 'beacon_service.dart';

class BeaconPage extends StatefulWidget {
  const BeaconPage({super.key});

  @override
  State<BeaconPage> createState() => _BeaconPageState();
}

class _BeaconPageState extends State<BeaconPage> {
  final BeaconService _service = BeaconService();
  bool _sending = false;
  String _status = 'Ready';

  Future<void> _onSendPressed() async {
    setState(() {
      _sending = true;
      _status = 'Sending beacon...';
    });

    try {
      await _service.sendBeaconPress();
      if (!mounted) return;
      setState(() => _status = 'Beacon sent.');
    } catch (_) {
      if (!mounted) return;
      setState(() => _status = 'Failed to send beacon.');
    } finally {
      if (!mounted) return;
      setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Beacon MVP')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Press the button to send a Beacon event.'),
              const SizedBox(height: 12),
              const Text('Region: ${Env.awsRegion}'),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _sending ? null : _onSendPressed,
                child: Text(_sending ? 'Sending...' : 'Send Beacon'),
              ),
              const SizedBox(height: 16),
              Text(_status),
            ],
          ),
        ),
      ),
    );
  }
}
