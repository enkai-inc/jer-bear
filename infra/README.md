# Jer-Bear Infrastructure

AWS CDK (TypeScript) stack for the Jer-Bear medicine tracker. The single stack, `JerBearStack` (`lib/infra-stack.ts`), provisions:

- **4 DynamoDB tables** (PAY_PER_REQUEST, AWS-managed encryption, PITR, RETAIN on delete): `jer-bear-medicines`, `jer-bear-schedules` (GSI `byMedicine`), `jer-bear-dose-events` (GSIs `byMedicine`, `byTimestamp`), `jer-bear-devices` (GSI `byCaregiverCode`)
- **2 Node.js 20 Lambdas** bundled from `lambda/src/` with esbuild:
  - `jer-bear-api` — the REST API handler (read/write access to all tables)
  - `jer-bear-notification-checker` — runs on an EventBridge `rate(1 minute)` rule, finds due doses, and posts reminders to the Expo push API (`https://exp.host/--/api/v2/push/send`); read-only table access
- **API Gateway REST API** — routes for `/medicines`, `/schedules`, `/doses`, `/device`, `/caregiver/{code}`; stage throttling (25 rps / 50 burst); CORS restricted to `https://jer-bear.digitaldevops.io` and `http://localhost:8081`
- **Web hosting** — S3 (fully private, OAC) + CloudFront (HTTPS redirect, SPA 403/404 → `/index.html`) + Route53 alias for `jer-bear.digitaldevops.io`, deploying the Expo web build from `../mobile/dist`

Requests are authorized by the `X-Device-Id` header (a UUID bearer credential — see the root README's "Security model & known limitations").

## Prerequisite

`../mobile/dist` must exist before synth (the `BucketDeployment` asset points at it):

```bash
cd ../mobile && npx expo export --platform web
```

## Commands

- `npm run build` — compile TypeScript
- `npm run watch` — compile on change
- `npm test` — Jest unit tests (Lambda handlers + CDK Template assertions)
- `npx cdk synth` — emit the CloudFormation template
- `npx cdk diff` — compare against the deployed stack
- `npx cdk deploy` — deploy to the default AWS account/region

## Layout

- `bin/infra.ts` — CDK app entry point
- `lib/infra-stack.ts` — the stack
- `lambda/src/` — Lambda source (`api.ts`, `notification-checker.ts`, `db.ts`, `types.ts`, `constants.ts`); `types.ts` must stay in sync with `mobile/src/types.ts`
- `test/` — Jest tests
