output "frontend_role_arn" {
  value = aws_iam_role.frontend_deploy.arn
}

output "backend_role_arn" {
  value = aws_iam_role.backend_deploy.arn
}
