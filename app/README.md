# beacon_app

Flutter client for Light the Beacon. See the [root README](../README.md) for
architecture, setup, and the deploy/run commands — this app needs `--dart-define`
values from the CDK stack outputs to reach a backend.

## Layout

- `lib/bootstrap.dart` — starts Amplify and Firebase; both are allowed to fail so
  a missing backend or Firebase project degrades the app instead of crashing it
- `lib/src/config/` — `Env` (`--dart-define` values) and the Amplify config built
  from them at runtime
- `lib/src/features/beacon/` — the single screen (`beacon_page.dart`), the GraphQL
  client (`beacon_service.dart`), and FCM token handling (`push_service.dart`)
