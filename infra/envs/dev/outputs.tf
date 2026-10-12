output "region" {
  value = var.region
}

output "api_url" {
  value = module.api.api_url
}

output "user_pool_id" {
  value = module.auth.user_pool_id
}

output "user_pool_client_id" {
  value = module.auth.client_id
}

output "table_name" {
  value = module.data.table_name
}

output "tmdb_param_name" {
  value = local.tmdb_param_name
}
