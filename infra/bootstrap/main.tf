terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
  # No backend block — bootstrap uses local state by design (chicken-and-egg).
}

provider "aws" {
  region = "eu-north-1"
}

data "aws_caller_identity" "current" {}

locals {
  state_bucket_name = "portfolio-tfstate-${data.aws_caller_identity.current.account_id}"
  lock_table_name   = "portfolio-tf-lock"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.state_bucket_name
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "lock" {
  name         = local.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

output "state_bucket" {
  value       = aws_s3_bucket.tfstate.id
  description = "Name of the S3 bucket holding Terraform state for the main config."
}

output "lock_table" {
  value       = aws_dynamodb_table.lock.name
  description = "DynamoDB table used by the main Terraform config for state locking."
}

output "region" {
  value = "eu-north-1"
}
