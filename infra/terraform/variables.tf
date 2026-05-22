variable "region" {
  type    = string
  default = "eu-north-1"
}

variable "project_name" {
  type    = string
  default = "portfolio"
}

variable "github_owner" {
  type    = string
  default = "OneTrickSupport"
}

variable "frontend_repo_name" {
  type    = string
  default = "portfolio-frontend"
}

variable "backend_repo_name" {
  type    = string
  default = "portfolio-backend"
}

variable "cognito_domain_prefix" {
  type        = string
  default     = "portfolio-onetricksupport"
  description = "Globally unique Cognito hosted UI domain prefix. If taken, change this."
}

variable "google_oauth_client_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Google OAuth Client ID. Leave empty on first apply; fill in after creating Cognito domain."
}

variable "google_oauth_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "extra_allowed_origins" {
  type        = list(string)
  default     = ["http://localhost:5173"]
  description = "Extra allowed CORS origins, in addition to the CloudFront URL."
}
