data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../apps/api/dist"
  output_path = "${path.module}/lambda-api.zip"
  excludes    = ["local-server.js", "*.map"]
}

resource "aws_iam_role" "api_lambda" {
  name = "${local.name_prefix}-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "api_lambda" {
  name = "${local.name_prefix}-api-policy"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${local.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.main.arn,
          "${aws_dynamodb_table.main.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.statements.arn,
          "${aws_s3_bucket.statements.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:CreateSecret",
          "secretsmanager:PutSecretValue",
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${local.account_id}:secret:pocketbook/*"
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name_prefix}-api"
  role             = aws_iam_role.api_lambda.arn
  handler          = "handler.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME          = aws_dynamodb_table.main.name
      STATEMENTS_BUCKET   = aws_s3_bucket.statements.bucket
      USER_ID             = "me"
      LOCAL_MODE          = "false"
      PLAID_ENV           = "sandbox"
      PLAID_PRODUCTS      = "transactions"
      PLAID_COUNTRY_CODES = "US"
    }
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "statement_parser" {
  function_name    = "${local.name_prefix}-statement-parser"
  role             = aws_iam_role.api_lambda.arn
  handler          = "statement-parser.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME        = aws_dynamodb_table.main.name
      STATEMENTS_BUCKET = aws_s3_bucket.statements.bucket
      USER_ID           = "me"
      LOCAL_MODE        = "false"
    }
  }
}

resource "aws_lambda_permission" "allow_s3" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.statement_parser.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.statements.arn
}

resource "aws_s3_bucket_notification" "statements" {
  bucket = aws_s3_bucket.statements.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.statement_parser.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

resource "aws_lambda_function" "plaid_sync" {
  function_name    = "${local.name_prefix}-plaid-sync"
  role             = aws_iam_role.api_lambda.arn
  handler          = "plaid-sync.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.main.name
      USER_ID    = "me"
      LOCAL_MODE = "false"
      PLAID_ENV  = "sandbox"
    }
  }
}

resource "aws_cloudwatch_event_rule" "plaid_daily" {
  count               = var.enable_plaid_schedule ? 1 : 0
  name                = "${local.name_prefix}-plaid-daily"
  schedule_expression = "rate(1 day)"
}

resource "aws_cloudwatch_event_target" "plaid_daily" {
  count = var.enable_plaid_schedule ? 1 : 0
  rule  = aws_cloudwatch_event_rule.plaid_daily[0].name
  arn   = aws_lambda_function.plaid_sync.arn
}

resource "aws_lambda_permission" "plaid_events" {
  count         = var.enable_plaid_schedule ? 1 : 0
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.plaid_sync.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.plaid_daily[0].arn
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${local.name_prefix}-api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Pocketbook API Lambda errors"
  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }
}
