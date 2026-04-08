# Infra (CDK)

Infrastructure is defined in TypeScript with AWS CDK.

## Files

- `bin/infra.ts`: CDK app entrypoint
- `lib/stacks/beacon-stack.ts`: main MVP stack
- `lib/graphql/schema.graphql`: AppSync schema

## Commands

- `npm install`
- `npm run build`
- `npm run synth`
- `npm run diff`
- `npm run deploy`

## Notes

This first scaffold creates base resources only:
- Cognito User Pool + Client
- AppSync GraphQL API
- DynamoDB tables for Beacons and Events

Resolvers, Lambda handlers, and notification infrastructure are intentionally left for the next iteration to keep this first step simple.
