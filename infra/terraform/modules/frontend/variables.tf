variable "project_name" {
  type = string
}

variable "domain_name" {
  type        = string
  default     = ""
  description = "Custom domain, e.g. karlnilros.com. Leave empty to use the CloudFront URL."
}

variable "acm_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN (must be in us-east-1). Required when domain_name is set."
}
