# Infrastructure

Terraform for running Cartographer on AWS App Runner with RDS Postgres.

The application image is environment-agnostic — Postgres and every secret arrive
as environment variables — so nothing in `Dockerfile` or the app changes between
`docker compose up` and production.

```
GitHub push (master)
      │
      ▼
GitHub Actions ──OIDC──▶ AWS   (no long-lived access keys)
      │ docker buildx --platform linux/amd64
      ▼
   Amazon ECR ──auto-deploy on :latest──▶ App Runner ──▶ RDS PostgreSQL 16
                                              │
Secrets Manager ──(instance role)─────────────┘
```

> **First time deploying this?** Follow [WALKTHROUGH.md](./WALKTHROUGH.md)
> instead — same steps, but with cost guardrails, what-you-should-see checks,
> log-reading, deliberate-breakage experiments, and teardown. This file is the
> terse reference for when you already know the shape of it.

## Prerequisites

- Terraform >= 1.9, AWS CLI v2, credentials with admin-ish rights for the first apply
- Docker with buildx (for the one manual image push)

## Rollout

Steps 1–5 are one-time. After that, deploys are `git push`.

### 1. Configure

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# set admin_cidr to your IP:
curl -s https://checkip.amazonaws.com
```

### 2. First apply — everything except App Runner

`create_app_runner_service` defaults to `false` because App Runner cannot create
a service against an empty ECR repository.

```bash
terraform init
terraform apply
```

Creates ECR, RDS (~5–10 min), Secrets Manager entries, and the IAM roles.

### 3. Populate the LLM API key

Created with a placeholder so a real key never enters `.tfvars` or state.

```bash
aws secretsmanager put-secret-value \
  --secret-id cartographer/llm-api-key \
  --secret-string 'your-real-key'
```

Skip this if you set `mock_llm = true` for a first smoke test.

### 4. Seed the database

From the repo root. `schema.sql` is idempotent and the seed uses
`ON CONFLICT (sku) DO NOTHING`, so this is safe to re-run.

```bash
terraform -chdir=infra output -raw seed_command   # prints the exact command
```

This is the first real test of TLS to RDS — the local `postgres` image serves
plaintext only, so the handshake has never been exercised before this point.

### 5. Push the first image, then create the service

```bash
# from the repo root
ECR=$(terraform -chdir=infra output -raw ecr_repository_url)
aws ecr get-login-password --region eu-west-2 \
  | docker login --username AWS --password-stdin "${ECR%%/*}"

# --platform is not optional on Apple Silicon: App Runner is x86_64, and an
# arm64 image fails at startup with an exec-format error.
docker buildx build --platform linux/amd64 --target runner -t "$ECR:latest" --push .
```

Then flip the gate:

```bash
cd infra
terraform apply -var create_app_runner_service=true   # or set it in terraform.tfvars
terraform output app_url
```

### 6. Verify

```bash
URL=$(terraform -chdir=infra output -raw app_url)
curl -s "$URL/api/health"   # {"status":"ok"}
curl -s "$URL/api/ready"    # {"status":"ok","database":"reachable"}
```

Then open the URL and run a real conversation. **Watch that text streams word by
word.** A proxy that buffers the response would turn the demo into a long pause
followed by a wall of text; `lib/stream.ts` sets `no-transform` and
`X-Accel-Buffering: no` to prevent it, but App Runner's proxy is the first one
this has met.

### 7. Wire up CI/CD

Set these as GitHub repository *variables* (not secrets — none are sensitive):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output github_actions_role_arn` |
| `AWS_REGION` | e.g. `eu-west-2` |
| `ECR_REPOSITORY` | `cartographer` |
| `APP_URL` | `terraform output app_url` (optional, enables the smoke test) |

Push to `master` and confirm the rollout happens on its own.

---

## The egress trade-off

App Runner offers exactly two egress modes, and the choice is not free.

| | `app_runner_vpc_egress = false` (default) | `= true` |
|---|---|---|
| RDS | publicly accessible | private subnets |
| Outbound to LLM APIs | direct, free | **only via a NAT Gateway** |
| Extra cost | none | ~$32/mo |

With VPC egress, *all* outbound traffic leaves through the connector — including
the agent's calls to Anthropic/OpenAI/Google. There is no NAT Gateway in this
configuration, so enabling the flag without adding one will make `streamText`
hang until it times out. **The flag alone is not sufficient.**

The default therefore keeps RDS internet-reachable, protected by:

- `rds.force_ssl = 1`, pinned explicitly in a custom parameter group
- a 32-character generated password, never printed or committed
- certificate verification against Amazon's CA bundle in `certs/`
- storage encryption at rest

App Runner's DEFAULT egress has no stable IP range, so the security group cannot
be narrowed to it — the `0.0.0.0/0` ingress rule is doing real work, and the
honest description is "Postgres exposed to the internet behind TLS and a strong
credential". For a demo whose entire dataset is 39 fictional moisturisers and no
personal data, that is a reasonable trade. **It would not be acceptable for real
customer data.** Stated plainly here rather than buried, because a reviewer who
finds a public database with no acknowledgement of it draws a worse conclusion
than one who finds a documented trade-off.

To move to Phase 2: add a NAT Gateway and private subnets, then set
`app_runner_vpc_egress = true`. The public ingress rule removes itself and RDS
becomes private — no application changes.

## Cost

Roughly, `eu-west-2`, sitting idle. Estimates — check the AWS pricing pages for
your region before relying on them.

| | Est./mo |
|---|---|
| App Runner, 1 vCPU / 2 GB, `min_size = 1` | ~$10 idle |
| RDS `db.t4g.micro` + 20 GB gp3 | ~$14 (free for 12 months on a new account) |
| Secrets Manager, 2 secrets | ~$0.80 |
| ECR + data transfer | ~$1 |
| **Total** | **~$26**, or **~$12** with the RDS free tier |
| Phase 2 NAT Gateway | +~$32 |

The App Runner number is worth understanding rather than memorising. It bills
provisioned **memory** continuously (~$0.007/GB-hour, so 2 GB ≈ $10/month) but
**vCPU only while a request is actually being processed**. An idle service is
therefore much cheaper than the instance size suggests — but it is never free,
because `min_size` cannot be 0.

To cut the floor roughly in half while learning, drop to 0.5 vCPU / 1 GB:

```hcl
app_runner_cpu    = "512"
app_runner_memory = "1024"
```

If the project will sit idle for months, Cloud Run's scale-to-zero runs the same
container for ~$1–3/month. And `terraform destroy` between sessions takes the
whole bill to roughly zero — see the walkthrough.

## Teardown

```bash
terraform destroy
```

`deletion_protection = false` and `skip_final_snapshot = true` are set
deliberately so this works cleanly — appropriate for a re-seedable mock
catalogue, wrong for anything else.

## State

Local by default, and **it contains the generated database password in
plaintext**. `infra/.gitignore` keeps `*.tfstate` out of git. For remote state,
uncomment the S3 backend in `main.tf` and run `terraform init -migrate-state`.
