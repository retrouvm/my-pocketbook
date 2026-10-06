# My Pocketbook

Personal serverless budget dashboard: credit utilization + cash/envelope running budget, hosted on AWS for low idle cost and DevOps practice.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React + TypeScript (S3 + CloudFront) |
| API | API Gateway HTTP API + Lambda (Node 20) |
| Data | DynamoDB on-demand (single-table) |
| Auth | Cognito User Pool (MFA optional) |
| IaC | Terraform |
| Intake | Manual + CSV/OFX upload now; Plaid-ready |

## Repo layout

```
apps/web/          React SPA
apps/api/          Lambda handlers + local server
packages/shared/   Shared types & defaults (from your 2025 sheets)
infra/             Terraform
scripts/           Excel → API backfill
docs/              Cost, architecture, runbook
```

## Local development

Prerequisites: Node 20+.

```bash
npm install
npm run build -w @pocketbook/shared

# Terminal 1 — API (file-backed local DB in .data/)
npm run dev:api

# Terminal 2 — Web (proxies /api → :3001)
npm run dev:web
```

Open http://localhost:5173 and click **Continue locally**.

Seeded on first load: your default cards, category taxonomy, and monthly budget templates.

### Import 2025 Excel exports

With the local API running:

```bash
npm run import:excel -- --dir "/path/to/your/year-folder"
```

## Deploy to AWS

1. Install [AWS CLI](https://aws.amazon.com/cli/) and [Terraform](https://www.terraform.io/downloads) (≥ 1.5).
2. `aws configure` for your personal account.
3. Optional remote state: `bash infra/bootstrap-state.sh` then uncomment the backend in `infra/main.tf`.
4. Build the API bundle and apply:

```bash
npm ci
npm run build:api
cd infra
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

5. Create your Cognito user (email) in the console; enable MFA.
6. Build and publish the SPA:

```bash
# set env from terraform outputs
export VITE_API_URL=$(terraform -chdir=infra output -raw api_url)
export VITE_COGNITO_USER_POOL_ID=$(terraform -chdir=infra output -raw cognito_user_pool_id)
export VITE_COGNITO_CLIENT_ID=$(terraform -chdir=infra output -raw cognito_client_id)
export VITE_LOCAL_AUTH=false
npm run build:web
aws s3 sync apps/web/dist s3://$(terraform -chdir=infra output -raw web_bucket) --delete
```

7. Add the CloudFront URL to Cognito callback/logout URLs and re-apply if needed.

Plaid: set `PLAID_CLIENT_ID` / `PLAID_SECRET` on the API Lambda environment (or extend Terraform), then use the **Plaid** page. Keep `enable_plaid_schedule = true` only when you want daily sync.

## Security (public repo)

See [SECURITY.md](SECURITY.md). After cloning:

```bash
git config core.hooksPath .githooks
npm run check:secrets
```

Do not commit real statements, `.env` files, or Terraform state.

- **Credit:** charges `> 0`, payments/credits `< 0`
- **Cash:** income `> 0`, expenses & savings deposits `< 0`

## Docs

- [Architecture](docs/architecture.md)
- [Cost](docs/cost.md)
- [Runbook](docs/runbook.md)
