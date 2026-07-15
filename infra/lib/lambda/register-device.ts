import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AppSyncIdentityIAM, AppSyncResolverEvent } from 'aws-lambda';

import { normalizeCode } from './shared/normalize-code';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface RegisterDeviceArgs {
  beaconId: string;
  pushToken: string;
  platform: 'IOS' | 'ANDROID';
}

export const handler = async (event: AppSyncResolverEvent<RegisterDeviceArgs>) => {
  const identity = event.identity as AppSyncIdentityIAM | null;
  const identityId = identity?.cognitoIdentityId;
  if (!identityId) {
    throw new Error('Missing Cognito identity on request');
  }

  const beaconId = normalizeCode(event.arguments.beaconId);

  await ddb.send(
    new PutCommand({
      TableName: process.env.DEVICES_TABLE,
      Item: {
        beaconId,
        identityId,
        pushToken: event.arguments.pushToken,
        platform: event.arguments.platform,
        updatedAt: new Date().toISOString(),
      },
    }),
  );

  return true;
};
