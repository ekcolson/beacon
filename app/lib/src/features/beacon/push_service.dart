import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Wraps FCM token retrieval. Every method degrades to null rather than throwing
/// so a missing Firebase project only costs push, not the whole app.
class PushService {
  /// The `DevicePlatform` enum value the GraphQL API expects, or null where push
  /// isn't supported at all.
  String? get platform {
    if (kIsWeb) return null;
    if (Platform.isIOS) return 'IOS';
    if (Platform.isAndroid) return 'ANDROID';
    return null;
  }

  bool get isSupported => platform != null && Firebase.apps.isNotEmpty;

  /// Asks for notification permission and returns the FCM token, or null if the
  /// user declined or push isn't available on this build.
  Future<String?> requestToken() async {
    if (!isSupported) return null;

    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      final granted =
          settings.authorizationStatus == AuthorizationStatus.authorized ||
              settings.authorizationStatus == AuthorizationStatus.provisional;
      if (!granted) return null;

      return await messaging.getToken();
    } on Exception catch (e) {
      debugPrint('Could not obtain an FCM token: $e');
      return null;
    }
  }

  /// Fires when a beacon push arrives while the app is in the foreground.
  Stream<RemoteMessage> get onForegroundMessage =>
      isSupported ? FirebaseMessaging.onMessage : const Stream.empty();
}
