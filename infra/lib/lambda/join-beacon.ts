import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';

import { normalizeCode } from './shared/normalize-code';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface JoinBeaconArgs {
  code: string;
}

export const handler = async (event: AppSyncResolverEvent<JoinBeaconArgs>) => {
  const beaconId = normalizeCode(event.arguments.code);
  const createdAt = new Date().toISOString();

  try {
    await ddb.send(
      new PutCommand({
        TableName: process.env.BEACONS_TABLE,
        Item: { beaconId, createdAt },
        ConditionExpression: 'attribute_not_exists(beaconId)',
      }),
    );
    return { beaconId, createdAt };
  } catch (err) {
    if ((err as Error).name !== 'ConditionalCheckFailedException') {
      throw err;
    }
    const existing = await ddb.send(
      new GetCommand({
        TableName: process.env.BEACONS_TABLE,
        Key: { beaconId },
      }),
    );
    return existing.Item;
  }
};
