variable "project_name" {
  type = string
}

variable "region" {
  type = string
}

variable "cognito_domain_prefix" {
  type = string
}

variable "cloudfront_url" {
  type = string
}

variable "google_oauth_client_id" {
  type      = string
  sensitive = true
  default   = ""
}

variable "google_oauth_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "custom_domain_name" {
  type        = string
  default     = ""
  description = "Custom domain, e.g. karlnilros.com. Adds https://{domain} and https://www.{domain} to Cognito callback/logout URLs."
}
