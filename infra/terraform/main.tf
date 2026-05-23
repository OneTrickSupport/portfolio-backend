module "data" {
  source       = "./modules/data"
  project_name = var.project_name
}

module "frontend" {
  source       = "./modules/frontend"
  project_name = var.project_name
}

module "auth" {
  source                     = "./modules/auth"
  project_name               = var.project_name
  cognito_domain_prefix      = var.cognito_domain_prefix
  cloudfront_url             = "https://${module.frontend.cloudfront_domain_name}"
  google_oauth_client_id     = var.google_oauth_client_id
  google_oauth_client_secret = var.google_oauth_client_secret
  region                     = var.region
}

module "backend" {
  source               = "./modules/backend"
  project_name         = var.project_name
  region               = var.region
  items_table_name     = module.data.items_table_name
  items_table_arn      = module.data.items_table_arn
  users_table_name     = module.data.users_table_name
  users_table_arn      = module.data.users_table_arn
  cognito_user_pool_id = module.auth.user_pool_id
  cognito_client_id    = module.auth.user_pool_client_id
  allowed_origins = concat(
    ["https://${module.frontend.cloudfront_domain_name}"],
    var.extra_allowed_origins,
  )
}

module "iam" {
  source              = "./modules/iam"
  project_name        = var.project_name
  github_owner        = var.github_owner
  frontend_repo_name  = var.frontend_repo_name
  backend_repo_name   = var.backend_repo_name
  frontend_bucket_arn = module.frontend.bucket_arn
  cloudfront_arn      = module.frontend.cloudfront_arn
  backend_ecr_arn     = module.backend.ecr_arn
  backend_lambda_arn  = module.backend.lambda_arn
}
