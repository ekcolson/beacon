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

Note the stack outputs: `AppSyncUrl`, `IdentityPoolId`, `Region`, `FcmParameterName`.

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

**On WSL:** keep the repo on the Linux filesystem rather than a `/mnt/*` Windows
mount, and use a native Linux Flutter SDK. Windows mounts lack the `metadata`
option, so `chmod` fails and `npm install` can't link `node_modules/.bin`.

### Push notifications

Push works through FCM for both Android and iOS, which avoids per-platform SNS
and APNs certificate setup. It is optional: without it, in-app realtime updates
still work, which is enough to exercise the whole backend from two browser tabs.

The Gradle side is wired up already. What is left is the part only you can do:
creating the Firebase project and downloading its config.

1. Create a Firebase project, then register an **Android** app under exactly this
   package name:

   ```
   dev.rickyshack.beacon
   ```

   It has to match `applicationId` in `app/android/app/build.gradle.kts`, or the
   build fails with *"No matching client found for package name"*. For iOS,
   register a second app under the same string as the bundle id.
2. Download `google-services.json` into `app/android/app/`, and for iOS
   `GoogleService-Info.plist` into `app/ios/Runner/` (add it to the Runner target
   in Xcode). Both are gitignored: they are not really secret — they ship inside
   the app bundle, and the credential that can actually *send* pushes is the
   service account below — but this repo is public, so they stay out of it.

   Until `google-services.json` exists the Gradle plugin is skipped deliberately,
   so the Android build keeps working and only push is missing. Once it is there
   the plugin applies itself; nothing to switch on.
3. Generate a service account key (Project Settings → Service Accounts) and store
   it as a SecureString. CloudFormation cannot create SecureString parameters, so
   the stack only grants read on the name it expects (`FcmParameterName` output)
   — you create the parameter itself:
   ```bash
   aws ssm put-parameter --name /beacon/dev/fcm-service-account \
     --type SecureString --value file://service-account.json
   ```
   Re-run with `--overwrite` to rotate the key. Encryption uses the default
   `aws/ssm` KMS key, which needs no extra IAM setup.

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

## Rate limiting

A beacon can only be lit once every 10 seconds, enforced by a conditional update
on the beacon row (see `LIGHT_COOLDOWN_SECONDS` in `infra/lib/stacks/beacon-stack.ts`).
The limit is per *beacon*, not per device: once a beacon is lit everyone has
already been notified, so a second light seconds later is noise regardless of who
sends it, and that also closes the spam vector for anyone who knows the code. The
tradeoff is that one member's light briefly blocks another's.

## Known gaps

- No code validation beyond "not empty", so short codes are trivially guessable
  and there is no length cap.
- No TTL on `EventsTable`/`DevicesTable`; both grow forever.
- A rare `joinBeacon` race can return null against a non-null schema field.
- Push is untested on a real device: the Gradle wiring is in place, but nobody has
  supplied a `google-services.json` yet (see above).
