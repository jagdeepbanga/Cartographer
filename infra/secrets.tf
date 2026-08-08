# Restricted to URL-safe punctuation: this password is embedded in DATABASE_URL,
# and RDS separately rejects '/', '@', '"' and spaces in master passwords.
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "-_"
}

# recovery_window_in_days = 0 disables the 7-30 day soft-delete. Without it a
# `terraform destroy` followed by `apply` fails: the name is still reserved by
# the scheduled-for-deletion secret.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  description             = "Postgres connection string for Cartographer"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id

  # `endpoint` is already host:port. sslmode=require makes the intent explicit
  # on the wire; db/client.ts independently enables TLS for non-local hosts and
  # verifies against the bundled Amazon CA.
  secret_string = format(
    "postgresql://%s:%s@%s/%s?sslmode=require",
    aws_db_instance.postgres.username,
    urlencode(random_password.db.result),
    aws_db_instance.postgres.endpoint,
    aws_db_instance.postgres.db_name,
  )
}

# The LLM key is created empty and populated out-of-band, so a real API key
# never enters a .tfvars file or the Terraform state. Set it with:
#
#   aws secretsmanager put-secret-value \
#     --secret-id cartographer/llm-api-key \
#     --secret-string 'your-real-key'
#
# ignore_changes keeps Terraform from reverting it to the placeholder.
resource "aws_secretsmanager_secret" "llm_api_key" {
  name                    = "${local.name}/llm-api-key"
  description             = "API key for the active LLM provider (${var.llm_provider})"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "llm_api_key" {
  secret_id     = aws_secretsmanager_secret.llm_api_key.id
  secret_string = "PLACEHOLDER-set-with-aws-secretsmanager-put-secret-value"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

locals {
  # Each provider reads a differently-named env var; the app itself only cares
  # about LLM_PROVIDER plus the matching key.
  llm_api_key_env_var = {
    anthropic = "ANTHROPIC_API_KEY"
    openai    = "OPENAI_API_KEY"
    google    = "GOOGLE_GENERATIVE_AI_API_KEY"
  }[var.llm_provider]
}
