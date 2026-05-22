terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  backend "s3" {
    bucket         = "portfolio-tfstate-671607590750"
    key            = "main/terraform.tfstate"
    region         = "eu-north-1"
    dynamodb_table = "portfolio-tf-lock"
    encrypt        = true
  }
}
