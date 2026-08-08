variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-2"
}

variable "project_name" {
  description = "Prefix for all resource names."
  type        = string
  default     = "cartographer"
}

variable "admin_cidr" {
  description = <<-EOT
    Your public IP in CIDR form (e.g. "203.0.113.4/32"), allowed to reach
    Postgres on 5432 for seeding and psql access. Find it with:
      curl -s https://checkip.amazonaws.com
    Do not set this to 0.0.0.0/0.
  EOT
  type        = string

  validation {
    condition     = var.admin_cidr != "0.0.0.0/0"
    error_message = "admin_cidr must not be 0.0.0.0/0 — use your own /32."
  }
}

variable "app_runner_vpc_egress" {
  description = <<-EOT
    false (Phase 1): App Runner uses DEFAULT egress. RDS is publicly
    accessible, protected by forced TLS and a 32-character generated password.
    No NAT Gateway, no extra cost.

    true (Phase 2): App Runner routes egress through a VPC connector and RDS
    stops being publicly reachable. NOTE: with VPC egress, ALL outbound traffic
    goes through the VPC — including the agent's calls to the LLM provider — so
    this requires a NAT Gateway in a private subnet (~$32/mo) or those calls
    will hang. The NAT is not created here; see infra/README.md.
  EOT
  type        = bool
  default     = false
}

variable "create_app_runner_service" {
  description = <<-EOT
    App Runner cannot create a service against an empty ECR repository. Leave
    this false for the first apply, push an image, then set it to true and
    apply again. See the rollout order in infra/README.md.
  EOT
  type        = bool
  default     = false
}

variable "create_github_oidc_provider" {
  description = <<-EOT
    Create the GitHub Actions OIDC provider. An AWS account can only have one
    provider per URL, so set this to false if your account already has
    token.actions.githubusercontent.com registered.
  EOT
  type        = bool
  default     = true
}

variable "github_repository" {
  description = "GitHub repo allowed to assume the deploy role, as \"owner/name\"."
  type        = string
  default     = "jagdeepbanga/Cartographer"
}

variable "github_deploy_branch" {
  description = "Branch allowed to assume the deploy role. Scoped tightly on purpose — a wildcard here lets any branch or fork PR obtain AWS credentials."
  type        = string
  default     = "master"
}

variable "image_tag" {
  description = "ECR tag App Runner watches. Auto-deploy triggers when this tag is overwritten."
  type        = string
  default     = "latest"
}

# ---- Application runtime config -------------------------------------------

variable "llm_provider" {
  description = "Active LLM provider: anthropic | openai | google."
  type        = string
  default     = "google"

  validation {
    condition     = contains(["anthropic", "openai", "google"], var.llm_provider)
    error_message = "llm_provider must be one of: anthropic, openai, google."
  }
}

variable "domain" {
  description = "Active product domain — matches a file in /domain/*.config.json."
  type        = string
  default     = "beauty"
}

variable "product_limit" {
  description = "Products shown per category."
  type        = number
  default     = 4
}

variable "mock_llm" {
  description = "Run the scripted demo loop instead of calling the LLM. Useful for a first smoke test with no API key wired up."
  type        = bool
  default     = false
}

# ---- Sizing ----------------------------------------------------------------

variable "app_runner_cpu" {
  description = "App Runner vCPU units (1024 = 1 vCPU)."
  type        = string
  default     = "1024"
}

variable "app_runner_memory" {
  description = "App Runner memory in MB."
  type        = string
  default     = "2048"
}

variable "app_runner_min_size" {
  description = "Minimum warm instances. App Runner bills provisioned memory for these continuously and cannot scale to zero, so this is the monthly cost floor."
  type        = number
  default     = 1
}

variable "app_runner_max_size" {
  description = "Maximum instances. Keep app_runner_max_size x PG_POOL_MAX under the RDS instance's max_connections (~85 on db.t4g.micro)."
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage in GB."
  type        = number
  default     = 20
}

variable "pg_pool_max" {
  description = "Max Postgres connections per app instance, passed through to db/client.ts."
  type        = number
  default     = 5
}
