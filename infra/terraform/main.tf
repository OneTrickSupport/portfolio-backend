module "data" {
  source       = "./modules/data"
  project_name = var.project_name
}

module "domain" {
  count = var.domain_name != "" ? 1 : 0

  source = "./modules/domain"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  domain_name = var.domain_name
}

module "frontend" {
  source       = "./modules/frontend"
  project_name = var.project_name

  domain_name         = var.domain_name
  acm_certificate_arn = var.domain_name != "" ? module.domain[0].certificate_arn : ""
}

# Route 53 A records are here (not inside modules/domain) to avoid a circular
# dependency: the domain module needs to exist before the cert can be issued,
# while the CloudFront domain name is only known after modules/frontend runs.
resource "aws_route53_record" "apex" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.domain[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.frontend.cloudfront_domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront's fixed hosted zone ID
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.domain[0].zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.frontend.cloudfront_domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}

module "auth" {
  source                     = "./modules/auth"
  project_name               = var.project_name
  cognito_domain_prefix      = var.cognito_domain_prefix
  cloudfront_url             = "https://${module.frontend.cloudfront_domain_name}"
  google_oauth_client_id     = var.google_oauth_client_id
  google_oauth_client_secret = var.google_oauth_client_secret
  region                     = var.region
  custom_domain_name         = var.domain_name
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
    var.domain_name != "" ? [
      "https://${var.domain_name}",
      "https://www.${var.domain_name}",
    ] : [],
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
