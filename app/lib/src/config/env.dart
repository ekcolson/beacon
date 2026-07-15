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

  static const cognitoIdentityPoolId = String.fromEnvironment(
    'COGNITO_IDENTITY_POOL_ID',
    defaultValue: '',
  );

  /// False until the CDK outputs are passed in via --dart-define. While false,
  /// the backend is unreachable and the app runs in a degraded, offline state.
  static bool get isConfigured =>
      appSyncUrl.isNotEmpty && cognitoIdentityPoolId.isNotEmpty;
}
