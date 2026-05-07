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

### Shared GitHub App

Create one GitHub App, install it on both private repos, and store:

- Actions variable: `OI_AUTOMATION_APP_CLIENT_ID`
- Actions secret: `OI_AUTOMATION_APP_PRIVATE_KEY`

The app needs repository access to:

- `organizational-intelligence`
- `FT-Intelligence`

Minimum repository permission:

- `Contents: Read`

### `organizational-intelligence` Actions variables

- `GCLOUD_PROJECT_ID`
- `GCLOUD_REGION`
- `GCLOUD_SERVICE`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

### `organizational-intelligence` Actions secrets

- `OPENAI_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `MCP_AUTH_BEARER_TOKEN`

Add any other runtime env vars here if the host needs them in production.

## Notes

- The checked-in local `.env` can keep `REPOSITORY_FOLDER=../FT-Intelligence` for laptop use.
- CI does not use that path. The deploy workflow overrides it with `REPOSITORY_FOLDER=./FT-Intelligence`.
- `repository_dispatch` workflows only run when the receiving workflow file exists on the default branch.
- You can test the host workflow manually with `workflow_dispatch` before relying on the automatic dispatch from `FT-Intelligence`.
