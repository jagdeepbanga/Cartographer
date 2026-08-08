output "app_url" {
  description = "Public HTTPS URL of the deployed app."
  value       = var.create_app_runner_service ? "https://${aws_apprunner_service.app[0].service_url}" : "(App Runner not created yet — set create_app_runner_service = true)"
}

output "ecr_repository_url" {
  description = "Push target for the container image."
  value       = aws_ecr_repository.app.repository_url
}

output "rds_endpoint" {
  description = "Postgres host:port."
  value       = aws_db_instance.postgres.endpoint
}

output "github_actions_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN repository variable in GitHub."
  value       = aws_iam_role.github_actions.arn
}

output "database_url_secret_name" {
  description = "Secrets Manager entry holding the connection string."
  value       = aws_secretsmanager_secret.database_url.name
}

output "llm_api_key_secret_name" {
  description = "Populate this before the first live-provider run — it is created with a placeholder."
  value       = aws_secretsmanager_secret.llm_api_key.name
}

output "seed_command" {
  description = "Run from the repo root to apply the schema and seed products into RDS."
  value       = <<-EOT
    DATABASE_URL="$(aws secretsmanager get-secret-value \
      --secret-id ${aws_secretsmanager_secret.database_url.name} \
      --region ${var.aws_region} \
      --query SecretString --output text)" pnpm db:seed:docker
  EOT
}
