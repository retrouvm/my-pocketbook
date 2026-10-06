# Security

This repo is intended to be **public**. Treat anything committed as visible forever.

## Never commit

- `.env`, Cognito IDs with secrets, Plaid `PLAID_SECRET`, AWS keys
- Local DB dumps (`.data/`), Excel/CSV statement exports (except `fixtures/sample-statement.csv`)
- `terraform.tfvars`, `*.tfstate`, private keys, `credentials.json`

## Guards in this repo

1. **`.gitignore`** — blocks env files, finance dumps, Terraform state/tfvars, keys
2. **`npm run check:secrets`** — path + content scan for common leaks
3. **`.githooks/pre-push`** — runs the scan before every push

Enable the hook once after clone:

```bash
git config core.hooksPath .githooks
```

On Windows PowerShell, if bash hooks fail, run `npm run check:secrets` manually before pushing.

## Demo defaults

Seed accounts and budget amounts in `@pocketbook/shared` are **generic demos**, not real finances. Configure real accounts only in your local/deployed environment (never in git).

## After a leak

1. Rotate the credential immediately (AWS IAM, Plaid, Cognito app client, GitHub token).
2. Purge the file from git history (`git filter-repo` / BFG) — deleting in a new commit is not enough for a public repo.
3. Open an incident note for yourself: what leaked, when rotated, when history rewritten.
