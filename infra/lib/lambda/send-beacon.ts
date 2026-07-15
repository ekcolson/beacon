import { randomUUID } from 'node:crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AppSyncIdentityIAM, AppSyncResolverEvent } from 'aws-lambda';

import { normalizeCode } from './shared/normalize-code';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface SendBeaconArgs {
  beaconId: string;
}

export const handler = async (event: AppSyncResolverEvent<SendBeaconArgs>) => {
  const identity = event.identity as AppSyncIdentityIAM | null;
  const beaconId = normalizeCode(event.arguments.beaconId);
  const beaconEvent = {
    beaconId,
    eventId: randomUUID(),
    type: 'PRESS',
    pressedBy: identity?.cognitoIdentityId ?? 'unknown',
    pressedAt: new Date().toISOString(),
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.EVENTS_TABLE,
      Item: beaconEvent,
    }),
  );

  return beaconEvent;
};
