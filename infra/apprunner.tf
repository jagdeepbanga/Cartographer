# ---- Phase 2 only: VPC egress ----------------------------------------------
# Reminder: enabling this routes ALL outbound traffic through the connector,
# including the agent's calls to Anthropic/OpenAI/Google. Without a NAT Gateway
# reachable from these subnets, streamText will hang until it times out.

resource "aws_security_group" "app_runner" {
  count = var.app_runner_vpc_egress ? 1 : 0

  name_prefix = "${local.name}-apprunner-"
  description = "App Runner VPC connector egress"
  vpc_id      = data.aws_vpc.default.id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "app_runner_all" {
  count = var.app_runner_vpc_egress ? 1 : 0

  security_group_id = aws_security_group.app_runner[0].id
  description       = "Postgres plus outbound HTTPS to the LLM provider"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_apprunner_vpc_connector" "main" {
  count = var.app_runner_vpc_egress ? 1 : 0

  vpc_connector_name = local.name
  subnets            = data.aws_subnets.default.ids
  security_groups    = [aws_security_group.app_runner[0].id]
}

# ---- Autoscaling -----------------------------------------------------------

resource "aws_apprunner_auto_scaling_configuration_version" "main" {
  auto_scaling_configuration_name = local.name

  min_size = var.app_runner_min_size
  max_size = var.app_runner_max_size

  # Requests per instance before scaling out. The workload is long-lived SSE
  # streams that are idle most of their lifetime (waiting on the LLM), so a
  # generous value is appropriate — this is not CPU-bound work.
  max_concurrency = 50

  lifecycle {
    create_before_destroy = true
  }
}

# ---- The service -----------------------------------------------------------

resource "aws_apprunner_service" "app" {
  count = var.create_app_runner_service ? 1 : 0

  service_name                   = local.name
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.main.arn

  source_configuration {
    # Redeploy automatically when the watched tag is overwritten. This is what
    # makes the GitHub Actions workflow a pure "build and push" job.
    auto_deployments_enabled = true

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "3000"

        runtime_environment_variables = {
          NODE_ENV      = "production"
          DOMAIN        = var.domain
          LLM_PROVIDER  = var.llm_provider
          MOCK_LLM      = tostring(var.mock_llm)
          PRODUCT_LIMIT = tostring(var.product_limit)
          PG_POOL_MAX   = tostring(var.pg_pool_max)
        }

        # Resolved at container start by the instance role. Values never appear
        # in the service definition, the console, or Terraform state.
        runtime_environment_secrets = {
          DATABASE_URL                = aws_secretsmanager_secret.database_url.arn
          (local.llm_api_key_env_var) = aws_secretsmanager_secret.llm_api_key.arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.app_runner_cpu
    memory            = var.app_runner_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  # Points at the liveness endpoint, which does not touch Postgres — a database
  # problem should surface as 503s from /api/ready, not as App Runner killing
  # healthy containers in a loop.
  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  network_configuration {
    egress_configuration {
      egress_type       = var.app_runner_vpc_egress ? "VPC" : "DEFAULT"
      vpc_connector_arn = var.app_runner_vpc_egress ? aws_apprunner_vpc_connector.main[0].arn : null
    }
  }

  depends_on = [
    aws_iam_role_policy.apprunner_secrets,
    aws_secretsmanager_secret_version.database_url,
  ]
}
