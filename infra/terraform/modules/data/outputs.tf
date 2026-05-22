output "items_table_name" {
  value = aws_dynamodb_table.items.name
}

output "items_table_arn" {
  value = aws_dynamodb_table.items.arn
}
