# Terraform bootstrap

Creates the S3 bucket and DynamoDB lock table that the main Terraform config (`../terraform/`) uses as its remote state backend.

This config keeps **local state** on purpose — there's a chicken-and-egg problem otherwise (it can't use the bucket it's creating as its own backend).

## Run

```bash
terraform init
terraform apply
```

Outputs are referenced in `../terraform/backend.tf`.

## Recovering lost local state

The local `terraform.tfstate` here is gitignored. If you lose it, `terraform import` the existing bucket and lock table back into state — or just delete them and re-run (will fail if state bucket has objects, in which case empty it first).
