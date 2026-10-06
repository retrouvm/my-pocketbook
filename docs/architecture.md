# Architecture

## Dual-ledger product model

Matches the Google Sheets system:

1. **Credit ledger** — multi-card purchases, payments, utilization (15% target), weekly ladders, payment batches.
2. **Cash ledger** — checking running balance, fixed bills, income, savings envelopes.
3. **Budgets** — planned vs actual for CC parent categories and cash buckets.

## Request path

```
Browser (CloudFront/S3)
  → Cognito JWT
  → API Gateway HTTP API (JWT authorizer)
  → Lambda (apps/api)
  → DynamoDB
```

Statement uploads:

```
Browser → POST /imports/presign → S3 PUT
  → S3 event → statement-parser Lambda → ProposedTransaction rows
  → UI accept/reject → Transaction
```

Plaid (optional):

```
Link → /plaid/exchange → Secrets Manager (access_token)
  → EventBridge schedule or POST /plaid/sync → transactionsSync → Transaction (source=plaid)
```

## DynamoDB keys

| PK | SK | Entity |
|----|----|--------|
| `USER#me` | `ACCOUNT#id` | Account |
| `USER#me` | `CAT#kind#sub` | Category |
| `USER#me` | `BUDGET#YYYY-MM#cat` | Budget |
| `ACCOUNT#id` | `TXN#date#id` | Transaction |
| `USER#me` | `TXN#date#id` | Transaction mirror |
| GSI1 `USER#me` / `DATE#date#id` | | Month queries |
| `USER#me` | `UPLOAD#id` / `PROPOSED#…` | Import review |
| `USER#me` | `PLAID#itemId` | Plaid item metadata |

## Local mode

`LOCAL_MODE=true` uses `.data/db.json` instead of DynamoDB and skips S3/Secrets Manager — same HTTP routes as production for fast iteration.
