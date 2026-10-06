# Cost notes

Target: **under ~$5/month** idle/light personal use (before Plaid product fees).

## AWS (typical light use)

| Service | Expected |
|---------|----------|
| DynamoDB on-demand | cents (tiny item volume + PITR storage) |
| Lambda | free tier / cents |
| API Gateway HTTP API | cents |
| S3 (web + statements) | cents |
| CloudFront | often $1–3 with HTTPS traffic |
| Cognito | free tier for 1 MAU |
| CloudWatch Logs (14-day retention) | cents–low dollars |
| Secrets Manager (Plaid tokens) | ~$0.40/secret/month when used |

**Avoid for this app:** NAT Gateway, ALB, always-on ECS/EKS, RDS/Aurora baseline ACUs.

## Plaid

Plaid **Transactions** (and production Items) are usually the dominant cost — not AWS. Stay on **sandbox** while building. When going live, start with the fewest Items and prefer statement upload for cards that do not need real-time sync.

## FinOps habits this project teaches

- On-demand vs provisioned
- Log retention limits
- Alarm on Lambda errors without full APM
- No always-on data plane
- Cost anomaly awareness via AWS Budgets (recommended: $5 and $15 alerts on the account)
