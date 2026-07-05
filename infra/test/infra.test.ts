import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { JerBearStack } from '../lib/infra-stack';

const WEB_ORIGIN = 'https://jer-bear.digitaldevops.io';

let template: Template;

const distDir = path.join(__dirname, '..', '..', 'mobile', 'dist');
// Tracks whether THIS run fabricated the dist stub, so afterAll only removes
// what the test created and never deletes a developer's real expo export.
let createdDistStub = false;

beforeAll(() => {
  // BucketDeployment sources Source.asset('../mobile/dist'), which only exists
  // after `npx expo export` — create a stub so synth works in CI (mobile/dist
  // is gitignored as a build artifact directory).
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>stub</title>\n');
    createdDistStub = true;
  }

  const app = new cdk.App({
    // Skip esbuild bundling of the Lambda entries — assertions only need the
    // synthesized CloudFormation, not real code assets.
    context: { 'aws:cdk:bundling-stacks': [] },
  });
  const stack = new JerBearStack(app, 'Test');
  template = Template.fromStack(stack);
});

afterAll(() => {
  // Leaving the stub behind would let a later `cdk deploy` without a real
  // `npx expo export` silently replace the live site with the stub page.
  if (createdDistStub) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});

describe('DynamoDB tables', () => {
  it('creates 4 tables, all PAY_PER_REQUEST, encrypted, with PITR and Retain policy', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 4);

    const tables = template.findResources('AWS::DynamoDB::Table');
    expect(Object.values(tables).map(t => t.Properties.TableName).sort()).toEqual([
      'jer-bear-devices',
      'jer-bear-dose-events',
      'jer-bear-medicines',
      'jer-bear-schedules',
    ]);
    for (const table of Object.values(tables)) {
      expect(table.DeletionPolicy).toBe('Retain');
      expect(table.Properties.BillingMode).toBe('PAY_PER_REQUEST');
      expect(table.Properties.SSESpecification).toEqual({ SSEEnabled: true });
      expect(table.Properties.PointInTimeRecoverySpecification).toEqual(
        { PointInTimeRecoveryEnabled: true },
      );
    }
  });

  it('defines the byMedicine GSI on schedules and dose events', () => {
    for (const tableName of ['jer-bear-schedules', 'jer-bear-dose-events']) {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: tableName,
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({ IndexName: 'byMedicine' }),
        ]),
      });
    }
  });

  it('defines the byTimestamp GSI on dose events', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'jer-bear-dose-events',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'byTimestamp' }),
      ]),
    });
  });

  it('defines the byCaregiverCode GSI on devices', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'jer-bear-devices',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'byCaregiverCode' }),
      ]),
    });
  });
});

describe('Lambda functions', () => {
  it.each([['jer-bear-api'], ['jer-bear-notification-checker']])(
    '%s runs nodejs20.x with the table env vars',
    (functionName) => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Environment: {
          Variables: Match.objectLike({
            MEDICINES_TABLE: Match.anyValue(),
            SCHEDULES_TABLE: Match.anyValue(),
            DOSE_EVENTS_TABLE: Match.anyValue(),
            DEVICES_TABLE: Match.anyValue(),
          }),
        },
      });
    },
  );

  it('does not create an SNS topic (push goes via the Expo API)', () => {
    template.resourceCountIs('AWS::SNS::Topic', 0);
  });
});

describe('EventBridge', () => {
  it('runs the notification checker every minute', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 minute)',
      State: 'ENABLED',
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.objectLike({
            'Fn::GetAtt': Match.arrayWith([Match.stringLikeRegexp('NotificationChecker')]),
          }),
        }),
      ]),
    });
  });
});

describe('API Gateway', () => {
  it('exposes the expected resource paths', () => {
    const resources = template.findResources('AWS::ApiGateway::Resource');
    const pathParts = Object.values(resources).map(r => r.Properties.PathPart);
    for (const part of ['medicines', '{medicineId}', 'schedules', '{scheduleId}', 'doses', 'device', 'caregiver', '{code}']) {
      expect(pathParts).toContain(part);
    }
  });

  it('restricts CORS to the web origin and allows the X-Device-Id header', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'OPTIONS',
      Integration: Match.objectLike({
        IntegrationResponses: Match.arrayWith([
          Match.objectLike({
            ResponseParameters: Match.objectLike({
              'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Device-Id'",
              'method.response.header.Access-Control-Allow-Origin': `'${WEB_ORIGIN}'`,
            }),
          }),
        ]),
      }),
    });
  });

  it('throttles the deployed stage', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      MethodSettings: Match.arrayWith([
        Match.objectLike({
          ThrottlingRateLimit: 25,
          ThrottlingBurstLimit: 50,
          MetricsEnabled: true,
        }),
      ]),
    });
  });
});

describe('static web hosting', () => {
  it('blocks all public access to the site bucket', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'jer-bear-web',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('redirects viewers to HTTPS and rewrites 403/404 to /index.html', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
      }),
    });
  });
});
