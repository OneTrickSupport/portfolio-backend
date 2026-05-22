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
