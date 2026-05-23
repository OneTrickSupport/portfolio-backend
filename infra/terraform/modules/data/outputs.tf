output "items_table_name" {
  value = aws_dynamodb_table.items.name
}

output "items_table_arn" {
  value = aws_dynamodb_table.items.arn
}

output "users_table_name" {
  value = aws_dynamodb_table.users.name
}

output "users_table_arn" {
  value = aws_dynamodb_table.users.arn
}
