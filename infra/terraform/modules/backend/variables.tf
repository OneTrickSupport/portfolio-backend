variable "project_name" {
  type = string
}

variable "region" {
  type = string
}

variable "items_table_name" {
  type = string
}

variable "items_table_arn" {
  type = string
}

variable "cognito_user_pool_id" {
  type = string
}

variable "cognito_client_id" {
  type = string
}

variable "allowed_origins" {
  type = list(string)
}
