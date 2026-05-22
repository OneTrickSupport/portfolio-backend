# portfolio-backend

Node + TypeScript backend for [@OneTrickSupport](https://github.com/OneTrickSupport)'s developer portfolio, deployed as a Lambda container image behind API Gateway.

## Stack

- Node 20 + TypeScript
- Fastify + `@fastify/aws-lambda`
- DynamoDB (`@aws-sdk/client-dynamodb` + `lib-dynamodb`)
- Cognito JWT verification (`aws-jwt-verify`)
- Deployed as Lambda container image + API Gateway HTTP API
- Infrastructure-as-code: Terraform (in `infra/`)
- CI/CD: GitHub Actions with AWS OIDC (no long-lived keys)

## Local development

```bash
cp .env.example .env
npm install
npm run dev                  # http://localhost:3000
npm test
```

## Infrastructure

```bash
cd infra/bootstrap && terraform init && terraform apply   # one-time: state bucket + lock table
cd ../terraform   && terraform init && terraform apply    # everything else
```

## Sister repo

Frontend (React + shadcn/ui): [portfolio-frontend](https://github.com/OneTrickSupport/portfolio-frontend)
