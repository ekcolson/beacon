# Beacon MVP

Simple monorepo for the Beacon MVP:

- `app/`: Flutter client (web, Android, iOS)
- `infra/`: AWS CDK infrastructure (TypeScript)

## MVP Scope

- Join a Beacon with invite code
- Press one button to send a Beacon event
- Show realtime in-app updates
- Send push notifications to other members

## Quick Start

1. Build infra outputs:
   - `cd infra`
   - `npm install`
   - `npm run build`
2. Run app:
   - `cd app`
   - `flutter pub get`
   - `flutter run -d chrome`

This scaffold is intentionally minimal so we can add features in small steps.
