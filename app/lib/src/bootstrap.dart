import 'package:amplify_api/amplify_api.dart';
import 'package:amplify_auth_cognito/amplify_auth_cognito.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'config/amplify_config.dart';
import 'config/env.dart';

/// What actually came up at launch. Both subsystems are allowed to fail without
/// taking the app down: the backend can be missing (no --dart-define yet) and
/// push can be missing (no Firebase project yet), and in-app realtime still
/// works in the latter case.
class BootstrapResult {
  const BootstrapResult({
    required this.backendReady,
    required this.pushReady,
    this.warning,
  });

  final bool backendReady;
  final bool pushReady;
  final String? warning;
}

Future<BootstrapResult> bootstrap() async {
  final backend = await _configureAmplify();
  final push = await _initializeFirebase();

  return BootstrapResult(
    backendReady: backend == null,
    pushReady: push == null,
    warning: backend ?? push,
  );
}

/// Returns null on success, or a human-readable reason on failure.
Future<String?> _configureAmplify() async {
  if (!Env.isConfigured) {
    return 'Backend not configured. Pass APPSYNC_URL and '
        'COGNITO_IDENTITY_POOL_ID via --dart-define.';
  }
  if (Amplify.isConfigured) {
    return null; // Hot restart: Amplify keeps its config across the reload.
  }

  try {
    await Amplify.addPlugins([AmplifyAuthCognito(), AmplifyAPI()]);
    await Amplify.configure(buildAmplifyConfig());
    return null;
  } on AmplifyAlreadyConfiguredException {
    return null;
  } on Exception catch (e) {
    return 'Could not reach the Beacon backend: $e';
  }
}

/// Returns null on success, or a human-readable reason on failure.
Future<String?> _initializeFirebase() async {
  if (kIsWeb) {
    return 'Push notifications are not enabled on web; in-app updates only.';
  }
  if (Firebase.apps.isNotEmpty) {
    return null;
  }

  try {
    await Firebase.initializeApp();
    return null;
  } on Exception catch (e) {
    return 'Push notifications unavailable (Firebase not set up): $e';
  }
}
