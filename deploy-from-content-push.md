# Deploy From `FT-Intelligence` Pushes

This repo can be deployed automatically from GitHub Actions whenever `FT-Intelligence` changes.

## Flow

1. A push to `FT-Intelligence` on `primary` changes `prompts/**` or `sharedContext/**`.
2. `FT-Intelligence/.github/workflows/notify-oi-deploy.yml` sends a `repository_dispatch` event to `organizational-intelligence`.
3. `organizational-intelligence/.github/workflows/deploy-from-content-push.yml` checks out both repos on a GitHub-hosted runner.
4. The deploy workflow sets `REPOSITORY_FOLDER=./FT-Intelligence` and runs `npm run deploy`.

The deploy script copies `./FT-Intelligence` into the staged Docker build context, and the running container resolves the content from `/app/FT-Intelligence`.

## Required GitHub configuration

Configure these in GitHub before enabling the workflows.

### Admin checklist

1. Create a GitHub App for internal automation.
2. Install it on the organization with access to:
   - `organizational-intelligence`
   - `FT-Intelligence`
3. Add the Actions variable and secret listed below to both repos.
4. Add the GCP and runtime configuration listed below to `organizational-intelligence`.
5. Manually run the `Deploy from FT-Intelligence push` workflow once.
6. After that succeeds, push a test markdown change to `FT-Intelligence` on `primary`.

### Shared GitHub App

Create one GitHub App, install it on both private repos, and store:

- Actions variable: `OI_AUTOMATION_APP_CLIENT_ID`
- Actions secret: `OI_AUTOMATION_APP_PRIVATE_KEY`

The app needs repository access to:

- `organizational-intelligence`
- `FT-Intelligence`

Recommended app settings:

- Homepage URL: your GitHub organization URL or the `organizational-intelligence` repo URL
- Callback URL: leave blank
- Webhooks: disabled
- Repository access: only selected repositories

Required repository permission:

- `Contents: Read and write`

### `FT-Intelligence` Actions variable and secret

Add these to `FT-Intelligence` so it can dispatch the host deploy workflow:

- Variable: `OI_AUTOMATION_APP_CLIENT_ID`
- Secret: `OI_AUTOMATION_APP_PRIVATE_KEY`

### `organizational-intelligence` Actions variables

- `OI_AUTOMATION_APP_CLIENT_ID`
- `GCLOUD_PROJECT_ID`
- `GCLOUD_REGION`
- `GCLOUD_SERVICE`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

### `organizational-intelligence` Actions secrets

- `OI_AUTOMATION_APP_PRIVATE_KEY`
- `OPENAI_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `MCP_AUTH_BEARER_TOKEN`

Add any other runtime env vars here if the host needs them in production.

### GCP setup

The deploy workflow expects GitHub-to-GCP auth through Workload Identity Federation.

Configure:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

That service account must be allowed to:

- submit Cloud Build builds
- deploy Cloud Run revisions
- impersonate any runtime service accounts required by your current deploy flow

## Manual verification

Run this once after the GitHub App, variables, secrets, and GCP auth are configured.

1. In `organizational-intelligence`, open Actions.
2. Run `Deploy from FT-Intelligence push` with:
   - `content_ref=primary`
   - optionally `content_sha=<known FT-Intelligence commit>`
3. Confirm the job summary shows:
   - the content repo
   - the ref or SHA
   - `REPOSITORY_FOLDER=./FT-Intelligence`
4. Confirm the runner checkout step lists the expected `.md` files.
5. Confirm the deploy step succeeds.
6. Confirm Cloud Run startup logs show:
   - `REPOSITORY_FOLDER raw value: ./FT-Intelligence`
   - `/app/FT-Intelligence`
   - repository initialization from `/app/FT-Intelligence`
7. After that, push a test change to `FT-Intelligence/prompts` or `FT-Intelligence/sharedContext` on `primary` and confirm the dispatch/deploy flow runs end-to-end.

## Notes

- The checked-in local `.env` can keep `REPOSITORY_FOLDER=../FT-Intelligence` for laptop use.
- CI does not use that path. The deploy workflow overrides it with `REPOSITORY_FOLDER=./FT-Intelligence`.
- `repository_dispatch` workflows only run when the receiving workflow file exists on the default branch.
- If you do not have org-level admin access, the same variables and secrets can be created at the repository level instead.
