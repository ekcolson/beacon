class Env {
  const Env._();

  // CDK outputs can be injected via --dart-define at runtime.
  static const awsRegion = String.fromEnvironment(
    'AWS_REGION',
    defaultValue: 'us-east-1',
  );

  static const appSyncUrl = String.fromEnvironment(
    'APPSYNC_URL',
    defaultValue: '',
  );

  static const cognitoUserPoolId = String.fromEnvironment(
    'COGNITO_USER_POOL_ID',
    defaultValue: '',
  );

  static const cognitoClientId = String.fromEnvironment(
    'COGNITO_CLIENT_ID',
    defaultValue: '',
  );
}
