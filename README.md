# Light the Beacon

Enter a shared code, press **Light the Beacon**, and everyone else who entered
the same code gets a notification.

There are no accounts. The code *is* the beacon: the first person to enter one
creates it, everyone else joins it, and every install gets an anonymous identity
from a Cognito Identity Pool so there is nothing to sign up for.

- `app/` — Flutter client (Android, iOS, web)
- `infra/` — AWS CDK infrastructure (TypeScript)

## How it works

```
Flutter app  ──SigV4/IAM──>  AppSync GraphQL API
     │                            │
     │  guest creds               ├──> joinBeacon      ──> BeaconsTable
     └── Cognito Identity Pool    ├──> registerDevice  ──> DevicesTable
         (unauthenticated only)   ├──> unregisterDevice──> DevicesTable
                                  └──> sendBeacon      ──> EventsTable
                                                             │
   in-app realtime  <── onBeaconSent subscription            │ DynamoDB stream
                                                             ▼
   push notification  <────── FCM  <────── notify-beacon Lambda
```

1. **Join.** Entering a code calls `joinBeacon`, which upserts a beacon keyed by
   the normalized code. Joining is also what makes a device a *recipient*: it
   registers the FCM token and opens the realtime subscription. Changing the code
   unregisters from the previous beacon before joining the new one.
2. **Light.** `sendBeacon` writes one row to `EventsTable`. That single write
   drives both channels: subscribers get an instant in-app update over the
   AppSync WebSocket, and the table's stream triggers `notify-beacon`.
3. **Fan out.** `notify-beacon` looks up every device on the beacon, drops the
   sender's own, and pushes to the rest via FCM's HTTP v1 API. Tokens FCM reports
   as permanently dead are pruned.

## Setup

### Prerequisites

- Node 20+ and an AWS account with credentials configured
- Flutter 3.41+
- A Firebase project (only needed for push — see [Push notifications](#push-notifications))

### Deploy the backend

```bash
cd infra
npm install
npx cdk bootstrap      # once per account/region
npm run deploy
```

Note the stack outputs: `AppSyncUrl`, `IdentityPoolId`, `Region`, `FcmSecretArn`.

### Run the app

Configuration is passed in at runtime, so a redeploy only changes these values:

```bash
cd app
flutter pub get
flutter run -d chrome \
  --dart-define=APPSYNC_URL=<AppSyncUrl> \
  --dart-define=COGNITO_IDENTITY_POOL_ID=<IdentityPoolId> \
  --dart-define=AWS_REGION=<Region>
```

Without those defines the app still starts, but shows a banner and stays offline.

**On Windows/WSL:** the Flutter SDK at `~/sdks/flutter` is a Windows install and
its bash entrypoint fails under WSL. Run it through `cmd.exe` instead:

```bash
cmd.exe /c "cd /d C:\path\to\app && flutter.bat test"
```

### Push notifications

Push works through FCM for both Android and iOS, which avoids per-platform SNS
and APNs certificate setup. It is optional: without it, in-app realtime updates
still work, which is enough to exercise the whole backend from two browser tabs.

1. Create a Firebase project and register an Android app under the package name
   in `app/android/app/build.gradle.kts` (`com.example.beacon_app`).
2. Put `google-services.json` in `app/android/app/`.
3. Add the `com.google.gms.google-services` Gradle plugin to
   `app/android/settings.gradle.kts` and `app/android/app/build.gradle.kts`.
   *(Not yet done — `flutter create` does not add it, and without it
   `Firebase.initializeApp()` fails at runtime and push silently never arrives.)*
4. Generate a service account key (Project Settings → Service Accounts) and load
   it into the secret the stack created:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id <FcmSecretArn> --secret-string file://service-account.json
   ```

## Commands

| Where   | Command             | Does                          |
| ------- | ------------------- | ----------------------------- |
| `infra` | `npm run build`     | Type-check the CDK app        |
| `infra` | `npm run synth`     | Synthesize CloudFormation     |
| `infra` | `npm run diff`      | Diff against the deployed stack |
| `infra` | `npm run deploy`    | Deploy                        |
| `app`   | `flutter analyze`   | Lint/analyze                  |
| `app`   | `flutter test`      | Widget tests                  |
| `app`   | `flutter build web` | Full compile check            |

## Testing end to end

The fastest check needs no Firebase: deploy, then open the app in two browser
windows with the same code. Lighting in one should appear in the other's feed
instantly. Push requires the Firebase steps above and two physical devices, with
the receiving app backgrounded.

## Known gaps

- No rate limit on `sendBeacon` — anyone with a code can spam push to members.
- No code validation beyond "not empty", so short codes are trivially guessable
  and there is no length cap.
- No TTL on `EventsTable`/`DevicesTable`; both grow forever.
- A rare `joinBeacon` race can return null against a non-null schema field.
- Android Firebase Gradle wiring is not done (see above).
