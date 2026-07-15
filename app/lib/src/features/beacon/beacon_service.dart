import 'dart:convert';

import 'package:amplify_flutter/amplify_flutter.dart';

/// A single "beacon was lit" event, as returned by `sendBeacon` and pushed over
/// the `onBeaconSent` subscription.
class BeaconEvent {
  const BeaconEvent({
    required this.beaconId,
    required this.eventId,
    required this.pressedBy,
    required this.pressedAt,
  });

  factory BeaconEvent.fromJson(Map<String, dynamic> json) {
    return BeaconEvent(
      beaconId: json['beaconId'] as String,
      eventId: json['eventId'] as String,
      pressedBy: json['pressedBy'] as String,
      pressedAt: DateTime.parse(json['pressedAt'] as String),
    );
  }

  final String beaconId;
  final String eventId;
  final String pressedBy;
  final DateTime pressedAt;
}

class BeaconException implements Exception {
  const BeaconException(this.message);

  final String message;

  @override
  String toString() => message;
}

class BeaconService {
  static const _eventFields = 'beaconId eventId type pressedBy pressedAt';

  /// Creates the beacon if this is the first join, otherwise joins the existing
  /// one. Returns the normalized beacon id, which the server derives from the
  /// code, so later calls must use the returned value rather than the raw input.
  Future<String> joinBeacon(String code) async {
    const document = r'''
      mutation JoinBeacon($code: ID!) {
        joinBeacon(code: $code) { beaconId createdAt }
      }
    ''';

    final data = await _mutate(
      document: document,
      variables: {'code': code},
      field: 'joinBeacon',
    );
    return (data as Map<String, dynamic>)['beaconId'] as String;
  }

  /// Registers this device's push token against the beacon so the fan-out
  /// Lambda knows to notify it.
  Future<void> registerDevice({
    required String beaconId,
    required String pushToken,
    required String platform,
  }) async {
    const document = r'''
      mutation RegisterDevice($beaconId: ID!, $pushToken: String!, $platform: DevicePlatform!) {
        registerDevice(beaconId: $beaconId, pushToken: $pushToken, platform: $platform)
      }
    ''';

    await _mutate(
      document: document,
      variables: {
        'beaconId': beaconId,
        'pushToken': pushToken,
        'platform': platform,
      },
      field: 'registerDevice',
    );
  }

  /// Stops push for this device on this beacon. Safe to call even if the device
  /// was never registered.
  Future<void> unregisterDevice({required String beaconId}) async {
    const document = r'''
      mutation UnregisterDevice($beaconId: ID!) {
        unregisterDevice(beaconId: $beaconId)
      }
    ''';

    await _mutate(
      document: document,
      variables: {'beaconId': beaconId},
      field: 'unregisterDevice',
    );
  }

  Future<BeaconEvent> sendBeacon(String beaconId) async {
    const document = '''
      mutation SendBeacon(\$beaconId: ID!) {
        sendBeacon(beaconId: \$beaconId) { $_eventFields }
      }
    ''';

    final data = await _mutate(
      document: document,
      variables: {'beaconId': beaconId},
      field: 'sendBeacon',
    );
    return BeaconEvent.fromJson(data as Map<String, dynamic>);
  }

  /// Live feed of beacons lit by anyone on this code, including this device.
  Stream<BeaconEvent> subscribe(String beaconId) {
    const document = '''
      subscription OnBeaconSent(\$beaconId: ID!) {
        onBeaconSent(beaconId: \$beaconId) { $_eventFields }
      }
    ''';

    final request = GraphQLRequest<String>(
      document: document,
      variables: {'beaconId': beaconId},
    );

    return Amplify.API.subscribe(request).map((event) {
      if (event.hasErrors) {
        throw BeaconException(_describe(event.errors));
      }
      final payload = jsonDecode(event.data!) as Map<String, dynamic>;
      return BeaconEvent.fromJson(
        payload['onBeaconSent'] as Map<String, dynamic>,
      );
    });
  }

  Future<Object?> _mutate({
    required String document,
    required Map<String, dynamic> variables,
    required String field,
  }) async {
    final request = GraphQLRequest<String>(
      document: document,
      variables: variables,
    );

    final response = await Amplify.API.mutate(request: request).response;
    if (response.hasErrors) {
      throw BeaconException(_describe(response.errors));
    }
    if (response.data == null) {
      throw const BeaconException('The server returned an empty response.');
    }

    return (jsonDecode(response.data!) as Map<String, dynamic>)[field];
  }

  String _describe(List<GraphQLResponseError> errors) {
    if (errors.isEmpty) {
      return 'Unknown error talking to the Beacon backend.';
    }
    return errors.map((e) => e.message).join('; ');
  }
}
