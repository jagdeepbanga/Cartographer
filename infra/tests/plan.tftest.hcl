# Plan-time tests against a mocked AWS provider — no credentials, no cost.
#
# `terraform validate` only checks static references; it cannot tell whether the
# count guards line up. These runs actually plan each supported combination, so
# a resource referencing e.g. aws_security_group.app_runner[0] while that
# resource has count = 0 fails here instead of during `terraform apply`.
#
#   cd infra && terraform test

mock_provider "aws" {
  mock_data "aws_vpc" {
    defaults = { id = "vpc-0123456789abcdef0" }
  }

  mock_data "aws_subnets" {
    defaults = { ids = ["subnet-0aaa", "subnet-0bbb", "subnet-0ccc"] }
  }

  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
}

mock_provider "random" {}

variables {
  admin_cidr = "203.0.113.4/32"
}

# ---- Phase 1: infrastructure only, before the first image exists ------------

run "phase1_without_service" {
  command = plan

  variables {
    create_app_runner_service = false
    app_runner_vpc_egress     = false
  }

  assert {
    condition     = length(aws_apprunner_service.app) == 0
    error_message = "App Runner must not be created before an image exists in ECR."
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.app_runner_public) == 1
    error_message = "DEFAULT egress needs the public ingress rule — App Runner has no fixed IPs to scope to."
  }

  assert {
    condition     = aws_db_instance.postgres.publicly_accessible == true
    error_message = "With DEFAULT egress, RDS must be publicly accessible or App Runner cannot reach it."
  }
}

# ---- Phase 1: service created after the image is pushed --------------------

run "phase1_with_service" {
  command = plan

  variables {
    create_app_runner_service = true
    app_runner_vpc_egress     = false
  }

  assert {
    condition     = length(aws_apprunner_service.app) == 1
    error_message = "App Runner service should exist once the gate is opened."
  }

  assert {
    condition     = aws_apprunner_service.app[0].health_check_configuration[0].path == "/api/health"
    error_message = "Health check must target the liveness endpoint, not a DB-touching one."
  }

  assert {
    condition     = aws_apprunner_service.app[0].network_configuration[0].egress_configuration[0].egress_type == "DEFAULT"
    error_message = "Phase 1 must use DEFAULT egress."
  }

  assert {
    condition     = length(aws_apprunner_vpc_connector.main) == 0
    error_message = "No VPC connector should be created in Phase 1."
  }
}

# ---- Phase 2: private RDS behind a VPC connector ---------------------------
# NOTE: passing this does not mean Phase 2 works end to end. VPC egress also
# needs a NAT Gateway for the agent's outbound LLM calls, which this
# configuration does not create. See infra/README.md.

run "phase2_vpc_egress" {
  command = plan

  variables {
    create_app_runner_service = true
    app_runner_vpc_egress     = true
  }

  assert {
    condition     = length(aws_apprunner_vpc_connector.main) == 1
    error_message = "Phase 2 must create the VPC connector."
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.app_runner_public) == 0
    error_message = "Phase 2 must drop the public Postgres ingress rule."
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.app_runner_vpc) == 1
    error_message = "Phase 2 must restrict Postgres to the VPC connector's security group."
  }

  assert {
    condition     = aws_db_instance.postgres.publicly_accessible == false
    error_message = "Phase 2 must make RDS private."
  }
}

# ---- Guardrails ------------------------------------------------------------

run "rejects_world_open_admin_cidr" {
  command = plan

  variables {
    admin_cidr = "0.0.0.0/0"
  }

  expect_failures = [var.admin_cidr]
}
