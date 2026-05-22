output "api_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  value = aws_lambda_function.backend.function_name
}

output "lambda_arn" {
  value = aws_lambda_function.backend.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_arn" {
  value = aws_ecr_repository.backend.arn
}
