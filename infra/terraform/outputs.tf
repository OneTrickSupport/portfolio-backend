output "cloudfront_url" {
  value = "https://${module.frontend.cloudfront_domain_name}"
}

output "cloudfront_distribution_id" {
  value = module.frontend.cloudfront_distribution_id
}

output "frontend_bucket" {
  value = module.frontend.bucket_name
}

output "api_url" {
  value = module.backend.api_url
}

output "ecr_repository_url" {
  value = module.backend.ecr_repository_url
}

output "lambda_function_name" {
  value = module.backend.lambda_function_name
}

output "items_table_name" {
  value = module.data.items_table_name
}

output "cognito_user_pool_id" {
  value = module.auth.user_pool_id
}

output "cognito_user_pool_client_id" {
  value = module.auth.user_pool_client_id
}

output "cognito_domain" {
  value = module.auth.cognito_domain
}

output "cognito_hosted_ui_callback_for_google" {
  value       = module.auth.google_callback_url
  description = "Paste this URL into your Google OAuth client's Authorized redirect URIs."
}

output "github_actions_frontend_role_arn" {
  value = module.iam.frontend_role_arn
}

output "github_actions_backend_role_arn" {
  value = module.iam.backend_role_arn
}
