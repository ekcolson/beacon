import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { GoogleAuth } from 'google-auth-library';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

/// FCM error codes that mean the token itself is permanently dead, so the row
/// should be dropped. Deliberately excludes INVALID_ARGUMENT: FCM also returns
/// it for a malformed *message*, and treating that as a dead token would delete
/// every device on the beacon over a bug in our own payload.
const DEAD_TOKEN_ERROR_CODES = new Set(['UNREGISTERED', 'SENDER_ID_MISMATCH']);

type PushOutcome = 'ok' | 'dead-token' | 'failed';

interface FcmCredentials {
  auth: GoogleAuth;
  projectId: string;
}

let cachedCredentials: FcmCredentials | undefined;

async function getFcmCredentials(): Promise<FcmCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const parameter = await ssm.send(
    new GetParameterCommand({
      Name: process.env.FCM_PARAMETER_NAME,
      WithDecryption: true,
    }),
  );
  const serviceAccount = JSON.parse(parameter.Parameter?.Value ?? '{}');
  if (!serviceAccount.project_id) {
    throw new Error(
      `FCM service account at ${process.env.FCM_PARAMETER_NAME} has no project_id; has it been populated yet?`,
    );
  }

  cachedCredentials = {
    auth: new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    }),
    projectId: serviceAccount.project_id,
  };
  return cachedCredentials;
}

function isDeadToken(status: number, body: string): boolean {
  if (status !== 403 && status !== 404) {
    return false;
  }
  try {
    const details = JSON.parse(body)?.error?.details ?? [];
    return details.some(
      (detail: { errorCode?: string }) =>
        detail.errorCode !== undefined && DEAD_TOKEN_ERROR_CODES.has(detail.errorCode),
    );
  } catch {
    return false;
  }
}

async function sendPush(
  accessToken: string,
  projectId: string,
  pushToken: string,
  data: Record<string, string>,
): Promise<PushOutcome> {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: pushToken,
        notification: {
          title: 'Beacon lit',
          body: `Beacon ${data.beaconId} was just lit.`,
        },
        data,
      },
    }),
  });

  if (response.ok) {
    return 'ok';
  }

  const body = await response.text();
  if (isDeadToken(response.status, body)) {
    return 'dead-token';
  }

  console.error('FCM send failed', response.status, body);
  return 'failed';
}

/// Reads every page: a Query stops at 1MB, which would silently skip members of
/// a large beacon.
async function listDevices(beaconId: string) {
  const devices: Record<string, any>[] = [];
  let startKey: Record<string, any> | undefined;

  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: process.env.DEVICES_TABLE,
        KeyConditionExpression: 'beaconId = :beaconId',
        ExpressionAttributeValues: { ':beaconId': beaconId },
        ExclusiveStartKey: startKey,
      }),
    );
    devices.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  return devices;
}

export const handler = async (event: DynamoDBStreamEvent) => {
  const inserts = event.Records.filter(
    (record) => record.eventName === 'INSERT' && record.dynamodb?.NewImage,
  );
  if (inserts.length === 0) {
    return;
  }

  const { auth, projectId } = await getFcmCredentials();
  const client = await auth.getClient();
  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to obtain an FCM access token');
  }

  for (const record of inserts) {
    const image = record.dynamodb!.NewImage!;
    const beaconId = image.beaconId?.S;
    const eventId = image.eventId?.S;
    const pressedBy = image.pressedBy?.S;
    if (!beaconId) {
      continue;
    }

    const devices = await listDevices(beaconId);
    const recipients = devices.filter((device) => device.identityId !== pressedBy);

    const outcomes = await Promise.all(
      recipients.map(async (device) => ({
        device,
        outcome: await sendPush(accessToken, projectId, device.pushToken, {
          beaconId,
          eventId: eventId ?? '',
        }),
      })),
    );

    // Uninstalled apps and rotated tokens would otherwise pile up forever and
    // be retried on every press.
    const dead = outcomes.filter((result) => result.outcome === 'dead-token');
    if (dead.length > 0) {
      console.log(`Pruning ${dead.length} dead token(s) from beacon ${beaconId}`);
      await Promise.all(
        dead.map((result) =>
          ddb.send(
            new DeleteCommand({
              TableName: process.env.DEVICES_TABLE,
              Key: { beaconId, identityId: result.device.identityId },
            }),
          ),
        ),
      );
    }
  }
};
