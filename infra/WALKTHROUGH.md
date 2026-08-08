# Deploying to AWS — a hands-on walkthrough

A guided run-through of putting this containerised AI agent onto AWS with a real
account. `README.md` in this directory is the reference; this is the lab.

Each step says **what you're doing**, **what to run**, **what you should see**,
and **what it teaches**. When something can go wrong, it says so before you hit
it rather than after.

Budget about 90 minutes for the first run. Most of that is waiting for RDS.

---

## Before anything else: the two rules

**1. Set a budget alarm before you create a single resource.** Step 2. Not
optional. Every cloud horror story starts with someone skipping it.

**2. `terraform destroy` when you finish a session.** Everything here is
rebuildable from scratch in about 20 minutes. Leaving it running costs roughly
$26/month; destroying it costs nothing. Build, learn, tear down, repeat.

Expected cost if you follow the walkthrough and destroy at the end: **under $1**.

---

## Step 0 — What you're about to build

```
your laptop ──push image──▶ ECR ──▶ App Runner ──▶ RDS PostgreSQL
                                        │
                                        └──▶ Google Gemini API (over the internet)
```

Four things doing four jobs:

| | Job | Replaces |
|---|---|---|
| **ECR** | Stores your Docker image | Docker Hub |
| **App Runner** | Runs the container, gives it an HTTPS URL | `app` in docker-compose |
| **RDS** | Managed Postgres | `db` in docker-compose |
| **Secrets Manager** | Holds the DB password and LLM key | `.env.local` |

The insight worth internalising: **your application does not change.** The same
image runs in both places. Only the environment variables differ. That is what
containerisation buys you, and this deployment is a demonstration of it.

---

## Step 1 — Account and CLI access

### 1.1 Get an AWS account

Sign up at [aws.amazon.com](https://aws.amazon.com). Needs a card even though
you'll stay near the free tier.

### 1.2 Stop using the root user immediately

The email address you signed up with is the **root user**. It can do anything,
including closing the account, and it cannot be restricted. Use it once to
create an admin user, then leave it alone.

In the console: **IAM → Users → Create user**

- Name: `cartographer-admin`
- Attach policies directly → `AdministratorAccess`
- Create → open the user → **Security credentials** → **Create access key**
- Use case: *Command Line Interface (CLI)*
- Save the access key ID and secret — the secret is shown **once**

Also enable MFA on the root user while you're there. Two minutes, and it's the
difference between a mistake and a disaster.

> **On `AdministratorAccess`:** it's over-privileged, and in a real job you'd
> scope it down. It's the pragmatic choice for a learning account you control,
> because Terraform touches IAM, RDS, ECR, App Runner, and Secrets Manager, and
> debugging permission errors would teach you nothing you're here for. Know that
> it's a shortcut.

### 1.3 Configure the CLI

```bash
brew install awscli    # if you don't have it
aws configure
```

Enter the access key, the secret, `eu-west-2` (or your preferred region), and
`json`.

**Verify:**

```bash
aws sts get-caller-identity
```

Expect JSON with your account ID and `.../cartographer-admin`. If it says
`root`, go back — you're using the wrong credentials.

> **What this teaches:** Terraform has no special access. It uses exactly these
> credentials, through exactly this CLI configuration. If `get-caller-identity`
> works, Terraform will authenticate; if it doesn't, no amount of Terraform
> debugging will help.

---

## Step 2 — Cost guardrails (do not skip)

### 2.1 A budget that emails you

Console: **Billing and Cost Management → Budgets → Create budget**

- Template: *Monthly cost budget*
- Amount: **$10**
- Email: yours

You get alerts at 85%, 100%, and forecasted 100%.

A budget **alerts**, it does not **cap**. AWS will not stop your resources when
you cross it. The only real cap is `terraform destroy`.

### 2.2 Turn on free tier alerts

**Billing → Billing preferences** → enable *Receive AWS Free Tier alerts*.

### 2.3 Know where to look

**Billing → Cost Explorer**, grouped by service. Check it after your first day.
Everything Terraform creates here is tagged `Project=cartographer`, so you can
filter to exactly this project's spend.

---

## Step 3 — Read the plan before creating anything

This is the most valuable habit in the whole walkthrough.

```bash
cd ~/Site/Cartographer/infra
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` — set `admin_cidr` to your own IP:

```bash
echo "$(curl -s https://checkip.amazonaws.com)/32"
```

Optional, to halve the idle cost while learning:

```hcl
app_runner_cpu    = "512"
app_runner_memory = "1024"
```

Then:

```bash
terraform init
terraform plan
```

**Read the output.** Don't skim it. You're looking for:

- `Plan: N to add, 0 to change, 0 to destroy` — nothing exists yet, so nothing
  should be changing or destroying
- No `aws_apprunner_service` — correct, the gate is closed until an image exists
- `aws_db_instance.postgres` with `publicly_accessible = true` — expected in
  Phase 1, and you know why
- `(sensitive value)` where the password would be

> **What this teaches:** `plan` is a dry run. It makes read-only API calls and
> tells you exactly what `apply` would do. In a real team, plan output is what
> gets reviewed on a pull request. Getting comfortable reading it is most of
> what separates confident infrastructure work from hoping.

---

## Step 4 — First apply: everything except App Runner

```bash
terraform apply
```

Type `yes`. **RDS takes 5–10 minutes** — this is normal, AWS is provisioning a
real database server.

**Expect:** `Apply complete! Resources: N added, 0 changed, 0 destroyed.`
followed by your outputs.

```bash
terraform output
```

### Go and look at what you made

Worth doing once, in the console:

- **RDS → Databases → cartographer** — note *Status: Available*, the endpoint,
  and under Connectivity that it's in the default VPC
- **ECR → Repositories** — `cartographer`, and it's **empty**. That's why App
  Runner can't exist yet.
- **Secrets Manager** — two secrets. Click `cartographer/database-url` →
  *Retrieve secret value*. That connection string was assembled by Terraform;
  you never typed the password and it isn't in any file you wrote.

> **What this teaches:** the dependency order is real, not bureaucratic. App
> Runner needs an image; the image needs a registry; the app needs a database
> URL that only exists after the database does. Terraform worked this ordering
> out from the references between resources — you never specified it.

---

## Step 5 — Put the real API key in

The secret exists but holds a placeholder, deliberately, so your key never
enters a file or Terraform state.

```bash
aws secretsmanager put-secret-value \
  --secret-id cartographer/llm-api-key \
  --secret-string 'YOUR-REAL-GEMINI-KEY'
```

Skip this if you set `mock_llm = true` — the scripted loop needs no key, and is
a reasonable way to do your first deploy with one less thing to go wrong.

---

## Step 6 — Seed the database (first real test of TLS)

This is the first moment something that could never be tested locally gets
exercised: a genuine TLS handshake to RDS.

```bash
cd ~/Site/Cartographer
terraform -chdir=infra output -raw seed_command    # prints the exact command
```

Run what it prints. **Expect:**

```
Running schema migrations...
Schema ready.
Seeding beauty products...
Done — 39 products inserted (0 already existed).
```

**If it hangs and times out**, your IP isn't allowed. Your ISP may have changed
it since Step 3:

```bash
curl -s https://checkip.amazonaws.com     # compare with admin_cidr
# update terraform.tfvars, then:
terraform -chdir=infra apply
```

**If you get a certificate or SSL error**, that's the CA bundle — see
Troubleshooting.

> **What this teaches:** this exact command is the one your laptop, CI, and the
> container all run. The only difference is the value of `DATABASE_URL`. That's
> the containerisation lesson in one line.

---

## Step 7 — Build and push the image

```bash
ECR=$(terraform -chdir=infra output -raw ecr_repository_url)

aws ecr get-login-password --region eu-west-2 \
  | docker login --username AWS --password-stdin "${ECR%%/*}"

docker buildx build --platform linux/amd64 --target runner -t "$ECR:latest" --push .
```

**`--platform linux/amd64` is not optional on an M-series Mac.** Without it you
build an arm64 image, App Runner refuses to run it, and the error you get —
`exec format error`, buried in CloudWatch — looks nothing like the cause. This
build runs under emulation and takes several minutes; that's the price of the
architecture mismatch, and it's why CI does it natively.

**Verify it landed:**

```bash
aws ecr describe-images --repository-name cartographer \
  --query 'imageDetails[].{Tags:imageTags,Pushed:imagePushedAt}' --output table
```

---

## Step 8 — Create the App Runner service

The registry now has an image, so the gate can open.

```bash
cd infra
terraform apply -var create_app_runner_service=true
```

Takes **5–10 minutes**. Watch it in the console: **App Runner → Services →
cartographer**, status `Operation in progress` → `Running`.

Make it permanent in `terraform.tfvars`:

```hcl
create_app_runner_service = true
```

```bash
terraform output app_url
```

---

## Step 9 — Verify, in order

```bash
URL=$(terraform output -raw app_url)

curl -s "$URL/api/health"    # {"status":"ok"}
curl -s "$URL/api/ready"     # {"status":"ok","database":"reachable"}
```

`/api/health` passing but `/api/ready` failing means the app is fine and the
database link is not — a distinction that saves real debugging time.

### The one that matters

Open `$URL` in a browser and have a real conversation.

**Watch how the text arrives.** It should appear word by word. If it arrives as
one block after a pause, App Runner's proxy is buffering the stream — the single
highest-risk unknown in this whole deployment, because it cannot be tested
anywhere but here. Fixes are in Troubleshooting.

Confirm from the command line too:

```bash
curl -sS -N -X POST "$URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"aws-test","messages":[{"role":"user","content":"I need a routine for sensitive skin"}]}' \
  | head -20
```

Separate `text_delta` lines = streaming intact.

---

## Step 10 — Learn to read the logs

You will need this. App Runner writes **two** log groups, and picking the wrong
one is why people get stuck:

| Log group | Contains |
|---|---|
| `/aws/apprunner/cartographer/<id>/service` | Deployment and platform events |
| `/aws/apprunner/cartographer/<id>/application` | **Your container's stdout/stderr** |

`aws logs tail` needs the exact group name, and the `<id>` is generated, so list
them first:

```bash
aws logs describe-log-groups \
  --log-group-name-prefix /aws/apprunner/cartographer \
  --query 'logGroups[].logGroupName' --output text
```

Then tail the one ending in `/application`:

```bash
aws logs tail '<paste-the-application-log-group>' --follow --since 10m
```

Leave that running in one terminal and use the app in a browser. You'll see your
own `console.error` output, the pool error handler if it fires, and Next.js
request logs.

> **Secrets Manager permission errors appear in the *application* log, not the
> deployment log.** The service just fails to start with little explanation
> elsewhere. This is the most common App Runner failure and knowing where to
> look is 90% of fixing it.

---

## Step 11 — Experiments worth doing

You have a live system. Break it on purpose — this is where the learning is.

**a. Watch a real deploy.** Change some UI text, rebuild and push (Step 7). App
Runner notices the new image and redeploys itself. Watch the status change in
the console. Note that the old container keeps serving until the new one passes
its health check — that's why zero-downtime deploys need a health endpoint.

**b. Prove the health/ready split.** In the console, change the RDS security
group to remove your ingress rule, then hit both endpoints. `/api/health` stays
200, `/api/ready` goes 503, and App Runner does **not** kill the container.
That's the design working. Put the rule back.

**c. Change config without rebuilding.** Set `product_limit = 2` in
`terraform.tfvars` and apply. App Runner restarts with new environment variables
using the *same image*. Configuration and code are separate — the twelve-factor
principle, observable.

**d. Read the secret injection.** In the App Runner console, look at the
environment variables. `DATABASE_URL` shows an ARN, not a password. The value is
resolved at container start by the instance role and never stored in the service
definition.

**e. Find your own cost.** Cost Explorer, filter tag `Project=cartographer`,
group by service. Compare with the README estimates.

---

## Step 12 — Wire up CI/CD (optional)

Set these as GitHub repository **variables** (Settings → Secrets and variables →
Actions → Variables). None are secret:

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_actions_role_arn` |
| `AWS_REGION` | `eu-west-2` |
| `ECR_REPOSITORY` | `cartographer` |
| `APP_URL` | `terraform output -raw app_url` |

Push to `master` and watch the Actions tab.

> **What this teaches:** the workflow holds no AWS password. GitHub proves its
> identity with a short-lived signed token (OIDC), AWS checks it came from your
> repo *and* your branch, and hands back credentials valid for minutes. Compare
> that to storing an access key in a secret that never expires and works from
> anywhere.

---

## Step 13 — Tear it down

**Do this at the end of every session.**

```bash
cd ~/Site/Cartographer/infra
terraform destroy
```

Type `yes`. Takes ~5 minutes.

**Verify nothing survived** — Terraform tags everything, so:

```bash
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=cartographer \
  --query 'ResourceTagMappingList[].ResourceARN' --output table
```

Empty is a good sign, but not proof — not every resource type reports to the
tagging API. Also check the RDS, App Runner, and ECR console pages directly, and
glance at **Billing → Cost Explorer** the next day. AWS reports with a delay, so
a small charge appearing after teardown is normal; a *growing* one is not.

Rebuilding later is Steps 4–8, about 20 minutes, no decisions to remake.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `exec format error` in application logs | arm64 image on an x86_64 platform | Rebuild with `--platform linux/amd64` |
| Service won't start, little explanation | Instance role can't read the secrets | Check the **application** log group, not the deployment one |
| Seed hangs then times out | Your IP isn't in `admin_cidr`, or it changed | Re-check `curl https://checkip.amazonaws.com`, update, re-apply |
| `no pg_hba.conf entry ... no encryption` | TLS not enabled on the client | `db/client.ts` should enable it for non-local hosts; check `PGSSLMODE` isn't set to `disable` |
| `self signed certificate in certificate chain` | CA bundle missing from the image | Confirm `certs/rds-global-bundle.pem` is tracked in git and copied in the Dockerfile |
| Streaming arrives as one block | Proxy buffering the SSE response | Confirm `no-transform` and `X-Accel-Buffering: no` are on the response; if so, add a periodic `: keepalive\n\n` frame in `lib/stream.ts` |
| Agent hangs, no reply, eventually errors | `app_runner_vpc_egress = true` with no NAT Gateway | Set it back to `false`, or add a NAT Gateway |
| `InvalidClientTokenId` | CLI credentials wrong or expired | `aws sts get-caller-identity` |
| `terraform destroy` fails on the secret | Already scheduled for deletion | `recovery_window_in_days = 0` is set to avoid this; if stuck, `aws secretsmanager delete-secret --force-delete-without-recovery` |

---

## What you should understand after this

- **Why the image doesn't change between laptop and cloud.** Same artefact, different environment variables. The whole point.
- **Why a health check is what makes zero-downtime deploys possible**, and why it must not depend on the database.
- **Why secrets are injected at runtime rather than baked into the image.** An image is a file; anyone who pulls it reads every layer.
- **Why CPU architecture is a real constraint**, not a detail — and where it bites.
- **How Terraform derives ordering** from references rather than instructions.
- **That a proxy sits between the internet and your container**, and it can change the behaviour of streaming responses in ways nothing local reveals.

The next exercise — swapping Gemini for Bedrock — builds on the last of these:
what changes when the AI provider is inside your cloud rather than outside it.
