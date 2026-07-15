import 'dart:convert';

import 'env.dart';

/// Amplify expects its configuration as a JSON string. We build it from the CDK
/// outputs rather than checking in a generated `amplifyconfiguration.dart`, so a
/// stack redeploy only changes --dart-define values.
///
/// Only the identity pool is configured (no user pool): every install gets guest
/// credentials, which is what the code-only model needs.
String buildAmplifyConfig() {
  return jsonEncode({
    'UserAgent': 'aws-amplify-cli/2.0',
    'Version': '1.0',
    'auth': {
      'plugins': {
        'awsCognitoAuthPlugin': {
          'UserAgent': 'aws-amplify-cli/0.1.0',
          'Version': '0.1.0',
          'IdentityManager': {'Default': <String, dynamic>{}},
          'CredentialsProvider': {
            'CognitoIdentity': {
              'Default': {
                'PoolId': Env.cognitoIdentityPoolId,
                'Region': Env.awsRegion,
              },
            },
          },
        },
      },
    },
    'api': {
      'plugins': {
        'awsAPIPlugin': {
          'beaconApi': {
            'endpointType': 'GraphQL',
            'endpoint': Env.appSyncUrl,
            'region': Env.awsRegion,
            'authorizationType': 'AWS_IAM',
          },
        },
      },
    },
  });
}
