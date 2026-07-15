#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { BeaconStack } from '../lib/stacks/beacon-stack';

const app = new cdk.App();

const appName = app.node.tryGetContext('appName') ?? 'beacon';
const envName = app.node.tryGetContext('envName') ?? 'dev';

new BeaconStack(app, `${appName}-${envName}-stack`, {
  stackName: `${appName}-${envName}`,
  description: 'Beacon MVP infrastructure managed by CDK.',
  appName,
  envName,
});
