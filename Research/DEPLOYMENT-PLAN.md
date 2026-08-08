# Deployment Plan — Cartographer on AWS App Runner + RDS

Target: run the existing container image on AWS, provisioned with Terraform and
shipped by GitHub Actions on push to `master`.

**Starting point is good.** `Dockerfile` already produces a non-root, standalone
Next.js runner image with `HOSTNAME=0.0.0.0` / `PORT=3000` and no secrets baked
in; `docker-compose.yml` already treats Postgres and all config as injected env.
That is exactly the shape App Runner wants. The work below is 20% application
code, 80% infrastructure.

---

## Target architecture

```
GitHub push (master)
      │
      ▼
GitHub Actions ──OIDC──▶ AWS
      │ docker buildx --platform linux/amd64
      ▼
   Amazon ECR  ──auto-deploy on new :latest──▶  AWS App Runner service
                                                    │  (VPC egress)
                                                    ├──▶ NAT GW ──▶ Anthropic/Google/OpenAI APIs
                                                    └──▶ RDS PostgreSQL 16 (private subnets)

Secrets Manager ──▶ App Runner runtime_environment_secrets (LLM keys, DATABASE_URL)
```

App Runner is chosen over ECS Fargate because it collapses ALB + target groups +
task definitions + service autoscaling into one resource, and gives HTTPS on an
`*.awsapprunner.com` domain for free. The container contract is identical, so
migrating to Fargate later is a Terraform change, not an application change.

---

## The one architectural decision that costs money

App Runner has exactly two egress modes, and this is the fork in the road:

| Mode | RDS reachable privately? | Outbound to LLM APIs | Extra cost |
|---|---|---|---|
| `DEFAULT` egress | No — RDS must be `publicly_accessible` | Direct, free | $0 |
| `VPC` egress (VPC connector) | Yes, private subnets | **Only via a NAT Gateway** | ~$32/mo + data |

With VPC egress, *all* outbound traffic leaves through the connector — including
the agent's calls to Anthropic/Google/OpenAI. Without a NAT Gateway in that VPC,
`streamText` will hang and time out. This surprises people.

Recommendation, and what the plan below builds:

- **Phase 1 (get it live, cheap):** `DEFAULT` egress + RDS `publicly_accessible = true`,
  hardened with `rds.force_ssl = 1`, a Secrets-Manager-generated 32-char password,
  and a security group allowing 5432 only from your own IP for seeding. App Runner
  itself has no fixed egress IPs, so the SG cannot be scoped to it — the honest
  characterisation is "internet-reachable Postgres protected by TLS + a strong
  credential", which is acceptable for a portfolio demo holding 39 mock products
  and no personal data. This is called out explicitly in the README, not hidden.
- **Phase 2 (optional, if you want the enterprise story):** flip to VPC egress,
  move RDS to private subnets, add NAT. It is ~15 lines of Terraform and one
  `terraform apply`, because everything else is already env-driven.

Do not skip stating this trade-off in the README — a reviewer noticing the public
RDS and finding no acknowledgement of it reads worse than the choice itself.

---

## Phase 0 — Application changes ✅ DONE

These are prerequisites; App Runner will misbehave without them. All implemented
and verified against the local Docker stack — see "Verified" at the end of this
section.

### 0.1 Add a health check endpoint — `app/api/health/route.ts`

App Runner's default health check is a TCP probe, which passes before Next is
actually serving. Configure an HTTP check against a real route.

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liveness only — deliberately does NOT touch Postgres. A DB blip should not
// cause App Runner to kill and replace otherwise-healthy instances.
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
```

Add a separate `/api/ready` that does `SELECT 1` if you want DB visibility — but
point App Runner's health check at `/api/health`, not at the DB-touching one.

### 0.2 TLS for RDS — `db/client.ts`

Current code is `new Pool({ connectionString })` with no `ssl`. RDS PostgreSQL 15+
ships `rds.force_ssl=1` in the default parameter group, so **this will fail to
connect as written**. Bundle Amazon's CA rather than using
`rejectUnauthorized: false`:

```bash
curl -o certs/rds-global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

```ts
import { Pool } from 'pg';
import fs from 'fs';

const useSSL = process.env.PGSSLMODE !== 'disable';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  // App Runner scales to N instances; each holds its own pool. Keep max low so
  // N × max stays under the instance class's max_connections (~85 on t4g.micro).
  max: Number(process.env.PG_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: useSSL
    ? { ca: fs.readFileSync('/app/certs/rds-global-bundle.pem', 'utf8') }
    : false,
});
```

- Add `COPY --from=builder --chown=node:node /app/certs ./certs` to the runner stage.
- Set `PGSSLMODE=disable` in `docker-compose.yml`'s `app` service so local
  Postgres keeps working unchanged.
- Add an unhandled-error guard: `db.on('error', (e) => console.error('pg pool error', e))`.
  Without it an idle-connection reset can crash the process.

### 0.3 SSE buffering headers — `lib/stream.ts`

The streaming UX is the demo. Make it proxy-proof:

```ts
headers: {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
}
```

Also verify against App Runner's request timeout once deployed — a long agent
turn that exceeds it will drop the stream mid-response. If that happens, either
raise the service's request timeout or emit a periodic `: keepalive\n\n` comment
frame from `createSSEStream`.

### 0.4 Platform pin

You're on Apple Silicon; App Runner runs x86_64. Any image built locally with a
plain `docker build` will fail to start with an exec-format error. Always
`docker buildx build --platform linux/amd64`. GitHub Actions' `ubuntu-latest`
runners are already amd64, so CI is unaffected — this only bites manual pushes.

### 0.5 Seed path for a remote DB

`pnpm db:seed` reads `.env.local`; `db:seed:docker` reads the ambient env. For a
remote RDS, the second works as-is:

```bash
DATABASE_URL='postgresql://...rds.amazonaws.com:5432/cartographer?sslmode=require' \
  pnpm db:seed:docker
```

`schema.sql` is idempotent (`IF NOT EXISTS` throughout) and the seed uses
`ON CONFLICT (sku) DO NOTHING`, so it is safe to re-run. No migration tool needed
at this stage.

### 0.6 Two things that only surfaced during implementation

**The CA path must be a static literal.** The first version used
`process.env.PG_CA_CERT_PATH ?? path.join(...)`. Next's build-time file tracer
can't resolve that, gives up, and traces the *entire repo* into
`.next/standalone` — `Research/`, `docs/demo.gif`, the `Dockerfile`, everything.
Output went from 39 MB to 65 MB and the build printed
"Encountered unexpected file in NFT list". Dropping the env override and using a
fully static `path.join(process.cwd(), 'certs', 'rds-global-bundle.pem')` fixed
it. Worth remembering for any future runtime file read.

**`.gitignore` silently ate the cert.** The Next.js default template ignores
`*.pem` to keep private keys out of git. The RDS bundle is public root
certificates, so it needs an explicit `!certs/rds-global-bundle.pem` negation.
Without it the failure mode is nasty: local Docker builds work (they read the
working tree, not git), CI checks out without the file, and the app throws
`ENOENT` at runtime *only in production*, because that's the only place TLS is
enabled. The negation is scoped so any other `.pem` stays ignored.

### Verified locally

- `pnpm exec tsc --noEmit` — clean.
- `pnpm build` — clean, no tracer warning, `.next/standalone` 39 MB with the cert
  correctly traced into `certs/`.
- `docker compose build app` → `up -d db` → `--profile seed run --rm seed` →
  `up -d app` — schema + 39 products seeded through the new pool config.
- `GET /api/health` → `200 {"status":"ok"}`.
- `GET /api/ready` → `200 {"status":"ok","database":"reachable"}`.
- `POST /api/chat` — response carries `cache-control: no-cache, no-transform`,
  `x-accel-buffering: no`, `Transfer-Encoding: chunked`, and `text_delta` events
  arrive one word at a time rather than as a single block.
- Inside the container as uid 1000 (`node`): cert readable at
  `/app/certs/rds-global-bundle.pem`, 108 certificates; SSL inference returns
  `false` for `db`/`localhost` and `true` for an `*.rds.amazonaws.com` host.

Not verified locally: an actual TLS handshake against RDS — the local `postgres`
image serves plaintext only. First real test is step 4 of the rollout.

---

## Phase 1 — Terraform (`infra/`)

Layout:

```
infra/
├── main.tf          # provider, backend
├── ecr.tf
├── rds.tf
├── secrets.tf
├── iam.tf
├── apprunner.tf
├── variables.tf
├── outputs.tf
└── terraform.tfvars.example
```

State: start with local state committed nowhere, or an S3 bucket +
`use_lockfile = true` (native S3 locking; DynamoDB tables are no longer required).
For a solo portfolio project local state is defensible — say so in a comment.

### Resources

**`ecr.tf`**
- `aws_ecr_repository.app` — `image_tag_mutability = "MUTABLE"` (App Runner
  auto-deploy watches a fixed tag), `scan_on_push = true`.
- `aws_ecr_lifecycle_policy` — expire untagged images after 7 days so the free
  tier isn't consumed by build layers.

**`rds.tf`**
- `aws_db_instance.postgres` — `engine = "postgres"`, version 16,
  `db.t4g.micro`, 20 GB gp3, `publicly_accessible = true` (Phase 1),
  `backup_retention_period = 1`, `deletion_protection = false`,
  `skip_final_snapshot = true` (it's a demo — say so in a comment),
  `performance_insights_enabled = false` (cost).
- `aws_security_group` — ingress 5432 from `var.admin_cidr` (your IP, for seeding)
  and from `0.0.0.0/0` only while in Phase 1 DEFAULT-egress mode. Gate that second
  rule behind a `var.app_runner_vpc_egress` boolean so flipping to Phase 2 removes
  it automatically.
- Uses the default VPC's subnets to avoid hand-rolling networking in Phase 1.

**`secrets.tf`**
- `random_password.db` (32 chars, no awkward URL-unsafe symbols).
- `aws_secretsmanager_secret` + `_version` for `DATABASE_URL`, assembled from the
  RDS endpoint + generated password + `?sslmode=require`.
- One secret per LLM provider key. Create the secret in Terraform with a
  placeholder and `lifecycle { ignore_changes = [secret_string] }`, then set the
  real value once via the CLI — so a real API key never lands in state or a
  `.tfvars` file.

**`iam.tf`**
- `aws_iam_role.apprunner_ecr_access` — trusted by `build.apprunner.amazonaws.com`,
  attached `AWSAppRunnerServicePolicyForECRAccess`.
- `aws_iam_role.apprunner_instance` — trusted by `tasks.apprunner.amazonaws.com`,
  with an inline policy granting `secretsmanager:GetSecretValue` on exactly the
  ARNs above. This is the role App Runner uses to resolve
  `runtime_environment_secrets` and the one that is most often forgotten.
- `aws_iam_openid_connect_provider` for GitHub + `aws_iam_role.github_actions`
  scoped by `sub` to `repo:jagdeepbanga/Cartographer:ref:refs/heads/master`, with
  permissions for ECR push and `apprunner:StartDeployment`/`DescribeService`.
  Scope the trust condition tightly — a wildcard `repo:*` here is a real
  vulnerability, not a style nit.

**`apprunner.tf`**
- `aws_apprunner_service.app`:
  - `source_configuration.image_repository` → ECR image `:latest`,
    `image_repository_type = "ECR"`, port `3000`.
  - `auto_deployments_enabled = true` — new image push redeploys automatically.
  - `instance_configuration` → 1 vCPU / 2 GB, `instance_role_arn` = instance role.
  - `runtime_environment_variables` → `DOMAIN`, `LLM_PROVIDER`, `MOCK_LLM=false`,
    `PRODUCT_LIMIT`, `NODE_ENV=production`.
  - `runtime_environment_secrets` → `DATABASE_URL` + the active provider key,
    referencing Secrets Manager ARNs.
  - `health_check_configuration` → `protocol = "HTTP"`, `path = "/api/health"`,
    `interval = 10`, `timeout = 5`, `healthy_threshold = 1`, `unhealthy_threshold = 5`.
- `aws_apprunner_auto_scaling_configuration_version` — `min_size = 1`,
  `max_size = 2`, `max_concurrency = 50`. Note App Runner bills provisioned
  memory continuously for `min_size` instances; `min_size = 1` is the cost floor.

**`outputs.tf`** — service URL, ECR repo URL, RDS endpoint.

---

## Phase 2 — CI/CD (`.github/workflows/deploy.yml`)

```
on: push to master (paths-ignore: README.md, docs/**, Research/**)
permissions: { id-token: write, contents: read }

jobs:
  build-and-push:
    - actions/checkout
    - aws-actions/configure-aws-credentials  (role-to-assume, OIDC — no static keys)
    - aws-actions/amazon-ecr-login
    - docker/setup-buildx-action
    - docker/build-push-action
        platforms: linux/amd64
        target: runner
        tags: <ecr>:latest, <ecr>:${{ github.sha }}
        cache-from/to: type=gha        # pnpm install + next build are the slow parts
    - (auto_deployments_enabled handles the rollout; optionally poll
       `aws apprunner describe-service` until OPERATION_IN_PROGRESS clears,
       then curl the health endpoint as a smoke test)
```

Add a cheap `verify` job on pull requests that runs `pnpm build` and
`tsc --noEmit` — there is currently no test suite, so the build is the only gate.
Worth noting as a gap: for a project marketed as senior-level, one Vitest
integration test over the agent loop with `MOCK_LLM=true` would carry weight.
`MOCK_LLM` already makes that easy — no API key needed in CI.

Seeding stays a deliberate manual step (`pnpm db:seed:docker` against RDS from
your machine). Automating destructive-adjacent data operations into every push is
the wrong default.

---

## Rollout order

1. Phase 0 code changes; verify with `docker compose up` locally that nothing regressed.
2. `terraform apply` with the App Runner service commented out — creates ECR, RDS, secrets, IAM.
3. Fill the LLM key secret via `aws secretsmanager put-secret-value`.
4. Seed RDS from your machine.
5. Push one image manually (`buildx --platform linux/amd64`) so `:latest` exists —
   App Runner cannot create a service against an empty repository.
6. Uncomment App Runner; `terraform apply`.
7. Smoke test: `/api/health`, then the full chat flow with `MOCK_LLM=true`, then
   with the live provider.
8. Wire GitHub OIDC + the workflow; verify a push redeploys.
9. Update README with the live URL, the architecture diagram, and the public-RDS
   trade-off note.

---

## Rough monthly cost (us-east-1, approximate)

| Item | Est. |
|---|---|
| App Runner, 1 vCPU / 2 GB, `min_size = 1` | ~$10 idle |
| RDS `db.t4g.micro` + 20 GB gp3 | ~$14 (free for 12 months on a new account) |
| Secrets Manager (2 secrets) | ~$0.80 |
| ECR storage + data transfer | ~$1 |
| **Phase 1 total** | **~$26**, or **~$12** on the RDS free tier |
| Phase 2 adds NAT Gateway | **+~$32** |

App Runner bills provisioned **memory** continuously (~$0.007/GB-hour) but
**vCPU only while a request is being processed**, so an idle service costs far
less than the instance size implies. It is still never free — `min_size` cannot
be 0. Dropping to 0.5 vCPU / 1 GB roughly halves the floor.

If cost matters more than the AWS story, Cloud Run scale-to-zero would be
~$1–3/mo for the same container — worth revisiting if this runs for months
rather than weeks.

---

## Risks / things to verify on first deploy

1. **SSE through App Runner's proxy** — the highest-risk unknown. Verify the
   stream arrives incrementally, not buffered into one blob at the end, and that
   a long agent turn doesn't hit the request timeout. Mitigations in §0.3.
2. **Cold-start latency** — `min_size = 1` avoids it; if you drop to a
   scale-to-zero-ish config to save money, the first request pays a container start.
3. **Connection exhaustion** — bounded by `PG_POOL_MAX` × `max_size` (5 × 2 = 10).
   Safe, but re-check if `max_size` grows.
4. **Secrets Manager access denied** — the single most common App Runner failure.
   Symptom is the service failing to start with a role error in the App Runner
   *application* logs (not the deployment log). Check the instance role first.
5. **`arm64` image** — exec-format error at start. See §0.4.
6. **`gen_random_uuid()`** — `schema.sql` creates the `pgcrypto` extension;
   RDS permits this for the master user, so seeding must run as the master user.
7. **No test suite** — nothing catches a regression before it reaches production
   except the build. Flagged above.
