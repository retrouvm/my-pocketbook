# Runbook

## Deploy API change

```bash
npm run build:api
cd infra && terraform apply
```

## Deploy web change

```bash
npm run build:web
aws s3 sync apps/web/dist s3://$WEB_BUCKET --delete
# Optional: invalidate CloudFront
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

## Create first Cognito user

AWS Console → Cognito → User pool → Users → Create user (email + temp password).
Sign in once, change password, enable TOTP MFA.

## DynamoDB restore (PITR)

1. Console → DynamoDB → table → Backups → Restore to point-in-time.
2. Update Lambda `TABLE_NAME` (or Terraform) to the restored table name.
3. Verify `/health` and a sample `/accounts` call.

## Statement parse failed

1. Check `/aws/lambda/pocketbook-*-statement-parser` logs.
2. Confirm object key is `uploads/{userId}/{uploadId}/{filename}`.
3. Re-upload CSV with headers: Date, Description, Amount.

## Plaid sync empty

1. Confirm Lambda env has `PLAID_CLIENT_ID` / `PLAID_SECRET`.
2. Confirm item `accountIds` maps to a Pocketbook account.
3. Invoke `POST /plaid/sync` and read CloudWatch logs.

## Local data reset

```bash
rm -rf .data
# restart API — POST /seed or open the SPA
```
