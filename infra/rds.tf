resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "rds" {
  name_prefix = "${local.name}-rds-"
  description = "Postgres access for Cartographer"
  vpc_id      = data.aws_vpc.default.id

  lifecycle {
    create_before_destroy = true
  }
}

# Your own IP — needed to run `pnpm db:seed:docker` against RDS and for psql.
resource "aws_vpc_security_group_ingress_rule" "admin" {
  security_group_id = aws_security_group.rds.id
  description       = "Operator access for seeding and psql"
  cidr_ipv4         = var.admin_cidr
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
}

# Phase 1 only. App Runner with DEFAULT egress has no stable egress IPs, so this
# rule cannot be scoped to it — the honest description is "Postgres reachable
# from the internet, protected by forced TLS and a 32-char generated password".
# Acceptable for a demo holding mock catalogue data and no personal data.
# Setting app_runner_vpc_egress = true removes this rule automatically.
resource "aws_vpc_security_group_ingress_rule" "app_runner_public" {
  count = var.app_runner_vpc_egress ? 0 : 1

  security_group_id = aws_security_group.rds.id
  description       = "App Runner DEFAULT egress has no fixed IPs to scope to"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
}

# Phase 2: only the App Runner VPC connector may reach Postgres.
resource "aws_vpc_security_group_ingress_rule" "app_runner_vpc" {
  count = var.app_runner_vpc_egress ? 1 : 0

  security_group_id            = aws_security_group.rds.id
  description                  = "App Runner VPC connector"
  referenced_security_group_id = aws_security_group.app_runner[0].id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "rds_all" {
  security_group_id = aws_security_group.rds.id
  description       = "Allow all outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# rds.force_ssl is already 1 in the default postgres16 parameter group, but
# pinning it here makes the guarantee explicit and survives AWS changing its
# defaults. It is a static parameter, hence pending-reboot.
resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${local.name}-pg16-"
  family      = "postgres16"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = 0 # no autoscaling — this is a fixed-size demo dataset
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "cartographer"
  username = "postgres"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name
  publicly_accessible    = !var.app_runner_vpc_egress

  auto_minor_version_upgrade   = true
  backup_retention_period      = 1
  performance_insights_enabled = false # costs money, not needed for a demo

  # Demo posture: the only data here is a re-seedable mock catalogue, so trading
  # safety rails for the ability to tear down cleanly is deliberate. Flip both
  # for anything holding real data.
  deletion_protection = false
  skip_final_snapshot = true

  apply_immediately = true
}
