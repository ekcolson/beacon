# CLAUDE.md

Guidance for Claude Code working in this repo. See `README.md` for product and
setup detail; this file covers what is not obvious from reading the code.

## What this is

Light the Beacon: enter a shared code, press a button, everyone else on that code
gets a push notification. Flutter client (`app/`) + AWS CDK backend (`infra/`).

## Environment

- **Line endings**: `.gitattributes` normalizes to LF. If a diff ever shows whole
  files rewritten rather than the lines you touched, that's CRLF — run
  `git add --renormalize .`, don't commit the noise.
- **`node_modules` is not portable across platforms**: esbuild ships an OS-specific
  binary, so a tree installed on one OS can't bundle the Lambdas on another.
  Reinstall it rather than copying one across.
- **On WSL, keep the repo on the Linux filesystem**, not a `/mnt/*` Windows mount.
  Those are mounted without the `metadata` option, so chmod silently fails with
  `EPERM`, which breaks `npm install` when it links `node_modules/.bin`.

## Commands

```bash
# infra/ — always run both before committing infra changes
npm run build      # tsc
npm run synth      # cdk synth; catches wiring errors tsc can't

# app/
flutter analyze
flutter test
flutter build web  # full compile check; catches more than analyze
```

## Architecture

`AppSync (IAM auth) → Lambda resolvers → DynamoDB`, with push fan-out driven off a
DynamoDB stream. Five Lambdas: `join-beacon`, `register-device`,
`unregister-device`, `send-beacon`, `notify-beacon`.

Load-bearing decisions, with the reasoning that isn't visible in the diff:

- **No accounts, by design.** AppSync uses IAM auth backed by a Cognito Identity
  Pool with *only* the unauthenticated role. Every install gets a stable
  `cognitoIdentityId` with no signup. Don't reintroduce a User Pool or login
  screen unless asked — an earlier scaffold had one and it was deliberately removed.
- **The code is the beacon id.** `normalizeCode` (trim + uppercase) turns user
  input into the partition key, so there is no separate lookup table. The server's
  normalized value is authoritative — the client uses what `joinBeacon` returns.
- **Push goes to FCM directly** (HTTP v1 API + `google-auth-library`, not
  `firebase-admin`, not SNS/APNs). One path covers Android and iOS, and it keeps
  the Lambda bundle small.
- **The FCM service account is an SSM SecureString the stack does not create.**
  CloudFormation cannot create SecureString parameters at all, so the stack only
  computes the name (`/{appName}/{envName}/fcm-service-account`) and grants
  `ssm:GetParameter`; a human runs `aws ssm put-parameter --type SecureString`.
  Don't "fix" this by switching to a plain String — and no `kms:Decrypt` grant is
  needed, because the default `aws/ssm` key already allows Decrypt for every IAM
  principal in the account. Parameter Store over Secrets Manager purely for cost:
  it made the stack's idle cost $0 instead of $0.40/mo, and this credential
  doesn't need rotation or cross-account sharing.
- **One write drives two channels.** `sendBeacon` writes to `EventsTable`; that
  write both fires the `onBeaconSent` subscription and triggers `notify-beacon`
  via the stream. Don't add a second write path for notifications.
- **Joining ≠ lighting.** Joining registers the push token and subscribes, which
  is what makes a device a recipient. Folding it into the button press would mean
  you never receive anything until you light the beacon yourself.
- **Only `UNREGISTERED`/`SENDER_ID_MISMATCH` count as dead tokens** in
  `notify-beacon`. FCM also returns `INVALID_ARGUMENT` for a malformed *message*,
  so treating that as a dead token would delete every device on a beacon over a
  bug in our own payload.
- **`dispose()` deliberately does not unregister.** Receiving pushes while the app
  is closed is the point of the product.
- **The rate limit is per beacon, not per device**, and is a conditional
  `UpdateItem` on the beacon row rather than a counter or WAF rule — DynamoDB
  evaluates it atomically, so concurrent presses can't both win. Per-beacon is the
  right unit because once a beacon is lit everyone is already notified; a second
  light seconds later is noise whoever sends it. Its `attribute_exists(beaconId)`
  clause is load-bearing: without it the update would upsert a beacon row with no
  `createdAt`, and `joinBeacon` would then return null for a non-null field.

## Conventions

- The app has no state management library — `StatefulWidget` + `setState`. Match it.
- Config comes from `--dart-define` at runtime (`Env` → `buildAmplifyConfig()`), not
  a checked-in `amplifyconfiguration.dart`, so redeploys don't require regeneration.
- `bootstrap()` lets both Amplify and Firebase fail independently and surfaces a
  banner. Preserve that: it's what allows testing the backend with no Firebase project.
- Comments explain *why*, not what. Don't annotate the obvious.
- Widget tests avoid the network by passing `backendReady: false`, or by mocking
  SharedPreferences empty so the restore path returns before touching Amplify.

## Known gaps

Deliberately unfixed; don't be surprised by them. No code length/charset
validation (short codes are enumerable); no TTL on `EventsTable`/`DevicesTable`;
rare `joinBeacon` race can return null against a non-null field; Lambda log groups
have no retention set; Android Firebase Gradle plugin wiring not done.
