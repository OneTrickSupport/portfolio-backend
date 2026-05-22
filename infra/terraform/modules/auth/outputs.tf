output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.main.arn
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.main.id
}

output "cognito_domain" {
  value = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
}

output "google_callback_url" {
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com/oauth2/idpresponse"
  description = "Add this exact URL to your Google OAuth client's Authorized redirect URIs."
}
