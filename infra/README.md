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
2. Store it as an SSM SecureString at the name in the `FcmParameterName` output.
   The stack does not create this parameter — CloudFormation cannot create
   SecureString parameters — it only grants `notify-beacon` read access to the name:
   `aws ssm put-parameter --name /beacon/dev/fcm-service-account --type SecureString --value file://service-account.json`
   Add `--overwrite` to rotate. The default `aws/ssm` key needs no extra IAM setup.
3. The Flutter app needs the corresponding `google-services.json` /
   `GoogleService-Info.plist` and the `firebase_messaging` plugin to receive pushes.

### Rate limiting

`sendBeacon` enforces a per-beacon cooldown (`LIGHT_COOLDOWN_SECONDS`, default 10s)
via a conditional update on the beacon row. The condition also requires the beacon
to exist, so lighting without joining first is rejected rather than silently
upserting a beacon row with no `createdAt`.
