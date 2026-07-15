import * as path from 'node:path';

import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class BeaconStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Anonymous, code-only identity: every app install gets a stable
    // Cognito identity id without any sign-up/sign-in step.
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: true,
    });

    const unauthenticatedRole = new iam.Role(this, 'UnauthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: { unauthenticated: unauthenticatedRole.roleArn },
    });

    const beaconsTable = new dynamodb.Table(this, 'BeaconsTable', {
      partitionKey: { name: 'beaconId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      partitionKey: { name: 'beaconId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // Push tokens per (beacon, device) so notification fan-out knows who to notify.
    const devicesTable = new dynamodb.Table(this, 'DevicesTable', {
      partitionKey: { name: 'beaconId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'identityId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const api = new appsync.GraphqlApi(this, 'BeaconApi', {
      name: 'beacon-api',
      schema: appsync.SchemaFile.fromAsset('lib/graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.IAM,
        },
      },
      xrayEnabled: true,
    });

    unauthenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [
          `${api.arn}/types/Query/*`,
          `${api.arn}/types/Mutation/*`,
          `${api.arn}/types/Subscription/*`,
        ],
      }),
    );

    const lambdaEnv = {
      BEACONS_TABLE: beaconsTable.tableName,
      EVENTS_TABLE: eventsTable.tableName,
      DEVICES_TABLE: devicesTable.tableName,
    };

    const joinBeaconFn = new NodejsFunction(this, 'JoinBeaconFn', {
      entry: path.join(__dirname, '..', 'lambda', 'join-beacon.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: lambdaEnv,
    });
    beaconsTable.grantReadWriteData(joinBeaconFn);

    const registerDeviceFn = new NodejsFunction(this, 'RegisterDeviceFn', {
      entry: path.join(__dirname, '..', 'lambda', 'register-device.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: lambdaEnv,
    });
    devicesTable.grantWriteData(registerDeviceFn);

    const unregisterDeviceFn = new NodejsFunction(this, 'UnregisterDeviceFn', {
      entry: path.join(__dirname, '..', 'lambda', 'unregister-device.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: lambdaEnv,
    });
    devicesTable.grantWriteData(unregisterDeviceFn);

    const sendBeaconFn = new NodejsFunction(this, 'SendBeaconFn', {
      entry: path.join(__dirname, '..', 'lambda', 'send-beacon.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: lambdaEnv,
    });
    eventsTable.grantWriteData(sendBeaconFn);

    // Firebase service account JSON, populated manually after deploy:
    //   aws secretsmanager put-secret-value --secret-id <FcmSecretArn output> --secret-string file://service-account.json
    const fcmSecret = new secretsmanager.Secret(this, 'FcmServiceAccountSecret', {
      description: 'Firebase service account JSON used to send FCM push notifications.',
    });

    const notifyBeaconFn = new NodejsFunction(this, 'NotifyBeaconFn', {
      entry: path.join(__dirname, '..', 'lambda', 'notify-beacon.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        DEVICES_TABLE: devicesTable.tableName,
        FCM_SECRET_ARN: fcmSecret.secretArn,
      },
    });
    // Read to find recipients, write to prune tokens FCM reports as dead.
    devicesTable.grantReadWriteData(notifyBeaconFn);
    fcmSecret.grantRead(notifyBeaconFn);
    notifyBeaconFn.addEventSource(
      new DynamoEventSource(eventsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        retryAttempts: 2,
      }),
    );

    api
      .addLambdaDataSource('JoinBeaconDataSource', joinBeaconFn)
      .createResolver('JoinBeaconResolver', { typeName: 'Mutation', fieldName: 'joinBeacon' });

    api
      .addLambdaDataSource('RegisterDeviceDataSource', registerDeviceFn)
      .createResolver('RegisterDeviceResolver', { typeName: 'Mutation', fieldName: 'registerDevice' });

    api
      .addLambdaDataSource('UnregisterDeviceDataSource', unregisterDeviceFn)
      .createResolver('UnregisterDeviceResolver', {
        typeName: 'Mutation',
        fieldName: 'unregisterDevice',
      });

    api
      .addLambdaDataSource('SendBeaconDataSource', sendBeaconFn)
      .createResolver('SendBeaconResolver', { typeName: 'Mutation', fieldName: 'sendBeacon' });

    api.addNoneDataSource('HealthDataSource').createResolver('HealthResolver', {
      typeName: 'Query',
      fieldName: 'health',
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        '{ "version": "2017-02-28", "payload": {} }',
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromString('"ok"'),
    });

    new cdk.CfnOutput(this, 'AppSyncUrl', {
      value: api.graphqlUrl,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: identityPool.ref,
    });

    new cdk.CfnOutput(this, 'FcmSecretArn', {
      value: fcmSecret.secretArn,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: cdk.Stack.of(this).region,
    });
  }
}
