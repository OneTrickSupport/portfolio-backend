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

## Apartment planner API

`src/planner/` serves the planner on the frontend's `/planner` routes. Anyone can read; saving, liking and commenting need a signed-in user.

| Route | Who | What |
|---|---|---|
| `GET /planner/designs` | anyone | all saved designs, newest first (no plans) |
| `GET /planner/designs/:id` | anyone | one design with its plan |
| `POST /planner/designs` | signed in | save a new design |
| `POST /planner/designs/:id` | owner | change title, plan or preview |
| `DELETE /planner/designs/:id` | owner | delete with its likes and comments |
| `POST` / `DELETE /planner/designs/:id/like` | signed in | like / take back |
| `GET /planner/designs/:id/comments` | anyone | comments, oldest first |
| `POST /planner/designs/:id/comments` | signed in | add a comment |
| `DELETE /planner/designs/:id/comments/:commentId` | author or design owner | remove a comment |

Everything is stored in one DynamoDB table (`PLANNER_TABLE_NAME`, layout described in `src/planner/dynamo-store.ts`). Plans are validated field by field (`src/planner/schema.ts`) because other visitors' browsers render them.

`npm test` runs the route tests against an in-memory store. To also test the DynamoDB store, start DynamoDB Local (`npm run db:start`) and run:

```bash
AWS_ENDPOINT_URL=http://localhost:8000 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-north-1 npm test
```

## Infrastructure

```bash
cd infra/bootstrap && terraform init && terraform apply   # one-time: state bucket + lock table
cd ../terraform   && terraform init && terraform apply    # everything else
```

## Sister repo

Frontend (React + shadcn/ui): [portfolio-frontend](https://github.com/OneTrickSupport/portfolio-frontend)
