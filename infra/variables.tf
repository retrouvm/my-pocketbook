variable "aws_region" {
  type        = string
  description = "AWS region"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Environment name"
  default     = "dev"
}

variable "app_domain" {
  type        = string
  description = "Optional custom domain for CloudFront (leave empty to use distribution domain)"
  default     = ""
}

variable "cognito_callback_urls" {
  type        = list(string)
  description = "OAuth callback URLs"
  default     = ["http://localhost:5173/", "http://localhost:5173"]
}

variable "cognito_logout_urls" {
  type        = list(string)
  description = "OAuth logout URLs"
  default     = ["http://localhost:5173/", "http://localhost:5173"]
}

variable "enable_plaid_schedule" {
  type        = bool
  description = "Create EventBridge rule to sync Plaid daily"
  default     = false
}
