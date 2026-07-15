import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AppSyncIdentityIAM, AppSyncResolverEvent } from 'aws-lambda';

import { normalizeCode } from './shared/normalize-code';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface UnregisterDeviceArgs {
  beaconId: string;
}

export const handler = async (event: AppSyncResolverEvent<UnregisterDeviceArgs>) => {
  const identity = event.identity as AppSyncIdentityIAM | null;
  const identityId = identity?.cognitoIdentityId;
  if (!identityId) {
    throw new Error('Missing Cognito identity on request');
  }

  const beaconId = normalizeCode(event.arguments.beaconId);

  // Deleting a key that isn't there is a successful no-op, so callers can fire
  // this without first checking whether they ever registered.
  await ddb.send(
    new DeleteCommand({
      TableName: process.env.DEVICES_TABLE,
      Key: { beaconId, identityId },
    }),
  );

  return true;
};
