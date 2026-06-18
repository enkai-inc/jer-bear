import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as path from 'path';

export class JerBearStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DynamoDB Tables ───────────────────────────────────────────

    const medicinesTable = new dynamodb.Table(this, 'Medicines', {
      tableName: 'jer-bear-medicines',
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'medicineId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const schedulesTable = new dynamodb.Table(this, 'Schedules', {
      tableName: 'jer-bear-schedules',
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'scheduleId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI: look up schedules by medicineId
    schedulesTable.addGlobalSecondaryIndex({
      indexName: 'byMedicine',
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'medicineId', type: dynamodb.AttributeType.STRING },
    });

    const doseEventsTable = new dynamodb.Table(this, 'DoseEvents', {
      tableName: 'jer-bear-dose-events',
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI: query dose events by medicine
    doseEventsTable.addGlobalSecondaryIndex({
      indexName: 'byMedicine',
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'medicineId', type: dynamodb.AttributeType.STRING },
    });

    // GSI: query dose events by timestamp (for history view)
    doseEventsTable.addGlobalSecondaryIndex({
      indexName: 'byTimestamp',
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    const devicesTable = new dynamodb.Table(this, 'Devices', {
      tableName: 'jer-bear-devices',
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI: look up device by caregiver code
    devicesTable.addGlobalSecondaryIndex({
      indexName: 'byCaregiverCode',
      partitionKey: { name: 'caregiverCode', type: dynamodb.AttributeType.STRING },
    });

    // ─── SNS Topic for Push Notifications ──────────────────────────

    const pushTopic = new sns.Topic(this, 'PushNotifications', {
      topicName: 'jer-bear-push-notifications',
    });

    // ─── Lambda Functions ──────────────────────────────────────────

    const lambdaDir = path.join(__dirname, '..', 'lambda');

    const commonEnv = {
      MEDICINES_TABLE: medicinesTable.tableName,
      SCHEDULES_TABLE: schedulesTable.tableName,
      DOSE_EVENTS_TABLE: doseEventsTable.tableName,
      DEVICES_TABLE: devicesTable.tableName,
      PUSH_TOPIC_ARN: pushTopic.topicArn,
    };

    const apiHandler = new lambdaNode.NodejsFunction(this, 'ApiHandler', {
      functionName: 'jer-bear-api',
      entry: path.join(lambdaDir, 'src', 'api.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
        forceDockerBundling: false,
      },
    });

    const notificationChecker = new lambdaNode.NodejsFunction(this, 'NotificationChecker', {
      functionName: 'jer-bear-notification-checker',
      entry: path.join(lambdaDir, 'src', 'notification-checker.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
        forceDockerBundling: false,
      },
    });

    // Grant table access
    for (const fn of [apiHandler, notificationChecker]) {
      medicinesTable.grantReadWriteData(fn);
      schedulesTable.grantReadWriteData(fn);
      doseEventsTable.grantReadWriteData(fn);
      devicesTable.grantReadWriteData(fn);
      pushTopic.grantPublish(fn);
    }

    // ─── API Gateway ───────────────────────────────────────────────

    const api = new apigateway.RestApi(this, 'JerBearApi', {
      restApiName: 'jer-bear-api',
      description: 'Jer-Bear Medicine Tracker API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Device-Id'],
      },
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(apiHandler);

    // Routes
    const medicines = api.root.addResource('medicines');
    medicines.addMethod('GET', lambdaIntegration);
    medicines.addMethod('POST', lambdaIntegration);

    const medicine = medicines.addResource('{medicineId}');
    medicine.addMethod('GET', lambdaIntegration);
    medicine.addMethod('PUT', lambdaIntegration);
    medicine.addMethod('DELETE', lambdaIntegration);

    const schedules = api.root.addResource('schedules');
    schedules.addMethod('GET', lambdaIntegration);
    schedules.addMethod('POST', lambdaIntegration);

    const schedule = schedules.addResource('{scheduleId}');
    schedule.addMethod('PUT', lambdaIntegration);
    schedule.addMethod('DELETE', lambdaIntegration);

    const doses = api.root.addResource('doses');
    doses.addMethod('GET', lambdaIntegration);
    doses.addMethod('POST', lambdaIntegration);

    const device = api.root.addResource('device');
    device.addMethod('POST', lambdaIntegration); // register device
    device.addMethod('GET', lambdaIntegration);   // get device info

    const caregiver = api.root.addResource('caregiver');
    caregiver.addMethod('POST', lambdaIntegration); // generate caregiver code
    const caregiverView = caregiver.addResource('{code}');
    caregiverView.addMethod('GET', lambdaIntegration); // caregiver read-only view

    // ─── EventBridge: Check for missed doses every minute ──────────

    new events.Rule(this, 'NotificationCheckerRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(notificationChecker)],
    });

    // ─── Static Web Hosting (jer-bear.digitaldevops.io) ──────────

    const domainName = 'jer-bear.digitaldevops.io';
    const hostedZoneId = 'Z3OKT7D3Q3TASV';
    const certArn = 'arn:aws:acm:us-east-1:882384879235:certificate/411f9b4a-bc8f-4342-b7e6-52f39251fa3a';

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: 'jer-bear-web',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this, 'SiteCert', certArn,
    );

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this, 'Zone', { hostedZoneId, zoneName: 'digitaldevops.io' },
    );

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [domainName],
      certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    new route53.ARecord(this, 'SiteAlias', {
      zone: hostedZone,
      recordName: 'jer-bear',
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution),
      ),
    });

    // Deploy web assets from Expo web build
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'mobile', 'dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ─── Outputs ───────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${domainName}`,
      description: 'Web App URL',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });
  }
}
