terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State holds the generated database password in plaintext. Local state is
  # defensible for a solo portfolio project — it never leaves this machine and
  # is git-ignored — but it is not backed up and not safe to share.
  #
  # To move to remote state, uncomment and run `terraform init -migrate-state`.
  # `use_lockfile` is native S3 locking; the old DynamoDB table is no longer
  # required.
  #
  # backend "s3" {
  #   bucket       = "cartographer-tfstate-<your-suffix>"
  #   key          = "cartographer/terraform.tfstate"
  #   region       = "eu-west-2"
  #   encrypt      = true
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "cartographer"
      ManagedBy = "terraform"
    }
  }
}

# The default VPC and its subnets. Deliberately not building a bespoke VPC:
# Phase 1 uses App Runner's DEFAULT egress, so nothing here needs private
# subnets, NAT, or route tables. See infra/README.md for the Phase 2 switch.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  name = var.project_name
}
