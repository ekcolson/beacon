# Infra (CDK)

Infrastructure is defined in TypeScript with AWS CDK.

## Files

- `bin/infra.ts`: CDK app entrypoint
- `lib/stacks/beacon-stack.ts`: main MVP stack
- `lib/graphql/schema.graphql`: AppSync schema
- `lib/lambda/`: resolver handlers (`joinBeacon`, `registerDevice`, `unregisterDevice`,
  `sendBeacon`) and the push notification fan-out handler (`notify-beacon`)

## Commands

- `npm install`
- `npm run build`
- `npm run synth`
- `npm run diff`
- `npm run deploy`

## Notes

Auth model: joining/using a Beacon requires no account. AppSync is authorized via IAM,
backed by a Cognito Identity Pool with only the unauthenticated role enabled, so every
app install gets a stable anonymous identity (`cognitoIdentityId`) without a login step.

Resources:
- Cognito Identity Pool (unauthenticated access only)
- AppSync GraphQL API (IAM auth)
- DynamoDB tables: `BeaconsTable`, `EventsTable` (stream enabled), `DevicesTable` (push tokens per beacon member)
- Lambda resolvers for `joinBeacon`, `registerDevice`, `unregisterDevice`, `sendBeacon`
- `notify-beacon` Lambda, triggered by the `EventsTable` stream, that fans out a push
  notification to every other device registered on the beacon via FCM's HTTP v1 API,
  and prunes tokens FCM reports as permanently dead (`UNREGISTERED`/`SENDER_ID_MISMATCH`)

### Push notifications (FCM) setup

Push fan-out needs a Firebase project with Cloud Messaging enabled:
1. Create a Firebase project (console.firebase.google.com) and generate a service
   account key (Project Settings → Service Accounts → Generate new private key).
2. After `cdk deploy`, populate the placeholder secret with that JSON:
   `aws secretsmanager put-secret-value --secret-id <FcmSecretArn output> --secret-string file://service-account.json`
3. The Flutter app (Phase 3) will need the corresponding `google-services.json` /
   `GoogleService-Info.plist` and the `firebase_messaging` plugin to receive pushes.

Not yet built: the Flutter-side code entry UI / GraphQL client and FCM token registration.
