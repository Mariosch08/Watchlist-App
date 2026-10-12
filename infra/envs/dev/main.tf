data "aws_caller_identity" "current" {}

locals {
  prefix          = "watchlist-${var.environment}"
  tmdb_param_name = "/watchlist/${var.environment}/tmdb_api_key"
  tmdb_param_arn  = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.tmdb_param_name}"
}

# Backend code: AWS SDK v3 is provided by the Lambda runtime, so only src/ is packaged.
data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/../../../backend/src"
  output_path = "${path.module}/build/backend.zip"
}

module "data" {
  source     = "../../modules/data"
  table_name = local.prefix
}

data "aws_iam_policy_document" "pre_sign_up" {
  statement {
    actions   = ["dynamodb:UpdateItem"]
    resources = [module.data.table_arn]
  }
}

module "pre_sign_up_fn" {
  source           = "../../modules/lambda_function"
  name             = "${local.prefix}-pre-sign-up"
  handler          = "handlers/preSignUp.handler"
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  policy_json      = data.aws_iam_policy_document.pre_sign_up.json
  environment = {
    TABLE_NAME = module.data.table_name
  }
}

module "auth" {
  source                  = "../../modules/auth"
  name                    = local.prefix
  pre_sign_up_lambda_arn  = module.pre_sign_up_fn.arn
  pre_sign_up_lambda_name = module.pre_sign_up_fn.function_name
}

data "aws_iam_policy_document" "api" {
  statement {
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
      "dynamodb:Query", "dynamodb:BatchWriteItem", "dynamodb:ConditionCheckItem",
    ]
    resources = [module.data.table_arn, "${module.data.table_arn}/index/*"]
  }
  statement {
    actions   = ["cognito-idp:AdminDeleteUser"]
    resources = [module.auth.user_pool_arn]
  }
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [local.tmdb_param_arn]
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

module "api_fn" {
  source           = "../../modules/lambda_function"
  name             = "${local.prefix}-api"
  handler          = "handlers/api.handler"
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  policy_json      = data.aws_iam_policy_document.api.json
  environment = {
    TABLE_NAME        = module.data.table_name
    USER_POOL_ID      = module.auth.user_pool_id
    TMDB_SECRET_PARAM = local.tmdb_param_name
  }
}

module "api" {
  source               = "../../modules/api"
  name                 = local.prefix
  region               = var.region
  user_pool_id         = module.auth.user_pool_id
  user_pool_client_id  = module.auth.client_id
  lambda_invoke_arn    = module.api_fn.invoke_arn
  lambda_function_name = module.api_fn.function_name
  cors_origins         = var.cors_origins
}
