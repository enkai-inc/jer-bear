# Jer-Bear

A kid-friendly medicine tracker: an Expo React Native app (iOS / Android / web) backed by an AWS serverless API. Kids (or their grown-ups) add medicines and dose schedules, get reminded when a dose is due, mark doses taken/snoozed/skipped, and can share a read-only view with a caregiver via a 6-character code.

Deployed web app: https://jer-bear.digitaldevops.io

## Repo layout

| Directory | What it is |
|---|---|
| `mobile/` | Expo app (SDK 56, TypeScript, zustand, jest-expo) |
| `infra/` | AWS CDK stack (`JerBearStack`) + Lambda source under `infra/lambda/` |

## Setup

Requires Node 20 and npm.

```bash
cd mobile && npm install
cd ../infra && npm install
cd lambda && npm install   # Lambda source has its own package.json
```

## Configuration

- **API URL** — the app reads `EXPO_PUBLIC_API_URL`. Copy `mobile/.env.example` to `mobile/.env` and set it to the `ApiUrl` output of the deployed `JerBearStack`. A hardcoded fallback exists in `mobile/src/services/api.ts` but logs a warning when used; don't rely on it.
- **Push notifications (native)** — `mobile/app.json` has an empty `extra.eas.projectId` placeholder. Real push tokens require provisioning an EAS project (`eas init`) and putting its projectId there; until then the app degrades gracefully (no push token, local notifications and web polling still work).

## Running the app

```bash
cd mobile
npm start        # Expo dev server (press a/i/w for Android/iOS/web)
npm run web      # web only
```

## Tests

```bash
cd mobile && npm test
cd infra && npm test
```

## Deploy

Order matters: the CDK stack bundles the web build from `mobile/dist` (`Source.asset` in `infra/lib/infra-stack.ts`), so the Expo export must exist **before** synth/deploy or synth fails.

```bash
# 1. Build the web app
cd mobile
npx expo export --platform web    # writes mobile/dist

# 2. Deploy the stack
cd ../infra
npx cdk synth
npx cdk deploy
```

Stack outputs: `ApiUrl` (feed into `mobile/.env`), `WebUrl`, `DistributionId`.

## Security model & known limitations

- **The `X-Device-Id` header is a bearer credential.** There are no user accounts by design; each install generates a UUID device ID and every API request is authorized solely by presenting it. Anyone who obtains the device ID can read and write that device's data. Don't paste it into logs, screenshots, or bug reports.
- **The caregiver code is a standing share code.** `POST /caregiver` mints a 6-character A–Z0–9 code that grants read-only access to the device's medicines, schedules, and recent doses for as long as it exists — there is no expiry or revocation. API Gateway stage throttling limits brute-force attempts, but treat the code like a password.
- **Push delivery requires EAS provisioning.** The backend posts to the Expo push API, but no device gets a real push until an EAS `projectId` is provisioned and set in `mobile/app.json` (see Configuration above). This step cannot be done from code.
