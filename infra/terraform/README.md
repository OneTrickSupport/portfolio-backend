# Main Terraform config

Creates all AWS resources for the portfolio site. Uses remote state in the S3 bucket created by `../bootstrap/`.

## First deploy (chicken-and-egg dance)

Lambda needs an image in ECR before it can be created. So:

```bash
# 1. Make sure AWS creds are present
eval "$(aws configure export-credentials --format env)"

# 2. Init
terraform init

# 3. Create ECR repo first
terraform apply -target=module.backend.aws_ecr_repository.backend

# 4. Build + push the initial image (run from portfolio-backend root)
cd ../..
ECR_URL=$(terraform -chdir=infra/terraform output -raw ecr_repository_url)
aws ecr get-login-password --region eu-north-1 | docker login --username AWS --password-stdin "$ECR_URL"
docker build --platform linux/arm64 -t "$ECR_URL:latest" .
docker push "$ECR_URL:latest"

# 5. Full apply
terraform -chdir=infra/terraform apply
```

## Wire Google OAuth (one-time, after first apply)

1. `terraform output cognito_hosted_ui_callback_for_google`
2. In Google Cloud Console → Credentials → your OAuth client → add that URL to **Authorized redirect URIs**.
3. Copy Google Client ID + Secret into a new file `terraform.tfvars` (use `terraform.tfvars.example` as template).
4. `terraform apply` again — this registers Google as a Cognito IdP.

## Day-2

GitHub Actions deploys app changes (lambda code, frontend bundle) — you only run `terraform apply` here when infrastructure changes.

## Tear down

```bash
terraform destroy
cd ../bootstrap && terraform destroy   # last, since the main state lives in the bucket bootstrap created
```
