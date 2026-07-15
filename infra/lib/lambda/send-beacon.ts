import { randomUUID } from 'node:crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { AppSyncIdentityIAM, AppSyncResolverEvent } from 'aws-lambda';

import { normalizeCode } from './shared/normalize-code';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const COOLDOWN_SECONDS = Number(process.env.LIGHT_COOLDOWN_SECONDS ?? 10);

interface SendBeaconArgs {
  beaconId: string;
}

/// Claims the right to light this beacon, or throws if it was lit too recently.
///
/// The conditional update is the rate limit: DynamoDB evaluates it atomically, so
/// simultaneous presses can't both pass. It also requires the beacon row to
/// already exist, which both enforces join-before-light and stops an upsert from
/// creating a beacon with no createdAt (which would break joinBeacon's non-null
/// contract).
async function claimCooldown(beaconId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - COOLDOWN_SECONDS * 1000).toISOString();

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.BEACONS_TABLE,
        Key: { beaconId },
        UpdateExpression: 'SET lastLitAt = :now',
        ConditionExpression:
          'attribute_exists(beaconId) AND (attribute_not_exists(lastLitAt) OR lastLitAt < :cutoff)',
        ExpressionAttributeValues: { ':now': now.toISOString(), ':cutoff': cutoff },
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
      }),
    );
  } catch (err) {
    if ((err as Error).name !== 'ConditionalCheckFailedException') {
      throw err;
    }
    // ALL_OLD tells the two failure modes apart without a second read: an item
    // means the beacon exists and we're inside the cooldown.
    const existing = (err as { Item?: Record<string, unknown> }).Item;
    if (!existing) {
      throw new Error(`Beacon ${beaconId} does not exist yet. Join it first.`);
    }
    throw new Error(
      `Beacon ${beaconId} was lit in the last ${COOLDOWN_SECONDS} seconds. Try again shortly.`,
    );
  }
}

export const handler = async (event: AppSyncResolverEvent<SendBeaconArgs>) => {
  const identity = event.identity as AppSyncIdentityIAM | null;
  const beaconId = normalizeCode(event.arguments.beaconId);
  const now = new Date();

  await claimCooldown(beaconId, now);

  const beaconEvent = {
    beaconId,
    eventId: randomUUID(),
    type: 'PRESS',
    pressedBy: identity?.cognitoIdentityId ?? 'unknown',
    pressedAt: now.toISOString(),
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.EVENTS_TABLE,
      Item: beaconEvent,
    }),
  );

  return beaconEvent;
};
