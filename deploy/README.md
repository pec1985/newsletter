# Container deployment

The image runs the compiled SvelteKit Node server on port 3000. The same image can run the Bun delivery and knowledge workers using command overrides. Data and uploaded media live in external PostgreSQL, not the container filesystem. No Kubernetes configuration is included.

## Publishing to GitHub Container Registry

`.github/workflows/container.yml` builds and publishes `linux/amd64` and `linux/arm64` images to `ghcr.io/<owner>/<repository>`. It runs on pushes to `main`, version tags (`v*`), and manual dispatch. Publishing is gated: type checking (`bun run check`) and unit tests (`bun test`) must pass first, then the built image must boot and serve `/health/live`, and a Trivy scan must find no fixable critical or high vulnerabilities. It does not deploy to a cluster.

The workflow authenticates using `GITHUB_TOKEN` with `packages: write`; no registry password secret is needed. If the package already exists, it must allow this repository to write to it. Main publishes `main`, `latest`, and `sha-<full-commit-sha>` tags. Version tags such as `v1.0.0` publish `1.0.0` and a SHA tag without replacing `latest`. Pin deployments to a published digest or SHA tag. Private packages require registry credentials with `read:packages` when pulling outside Actions.

The workflow follows [GitHub's container publishing documentation](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images). The web build uses the [SvelteKit Node adapter](https://svelte.dev/docs/kit/adapter-node).

## Runtime configuration

Supply these environment variables at runtime through your deployment's secret/configuration management:

| Variable                  | Purpose                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | Connection to durable PostgreSQL 17 with pgvector installed                                                           |
| `SETTINGS_ENCRYPTION_KEY` | Stable 64-character hex key for integration credentials; generate with `openssl rand -hex 32`                         |
| `APP_ORIGIN`              | Public HTTPS URL, such as `https://newsletter.example.com`, used in email links                                       |
| `ORIGIN`                  | Same public URL; tells the Node server its origin so CSRF checks and cookies do not depend on proxy-forwarded headers |

Keep the encryption key backed up; replacing it makes existing integration credentials unreadable. The image runs as UID/GID 1000, supports a read-only root filesystem, and defaults to `HOST=0.0.0.0`, `PORT=3000`, `BODY_SIZE_LIMIT=17M` (the contacts API accepts 16 MB bodies and knowledge uploads 10 MB), and `SHUTDOWN_TIMEOUT=30`.

Terminate HTTPS at your reverse proxy and set `ORIGIN` explicitly. Without it the server derives its origin from the forwarded Host header, and a misconfigured proxy silently breaks CSRF checks and login cookies. SvelteKit 3's Node adapter assumes HTTPS by default; for local HTTP testing, set `PROTOCOL_HEADER=x-forwarded-proto` and send `X-Forwarded-Proto: http`. Only trust headers overwritten by your proxy. If setting `ADDRESS_HEADER=x-forwarded-for`, configure `XFF_DEPTH` for the actual proxy chain; otherwise login throttling sees the proxy IP. Allow at least 17 MiB request bodies at the proxy.

## Database initialization and updates

Use a fresh production database. Development `db:setup` retains **admin/admin** and demo data; never expose the development database as production.

Run `bun run db:init` once using the published image and the production database environment. Supply `ADMIN_USERNAME` and `ADMIN_PASSWORD` (at least 16 characters) only to this initialization process. It creates the schema and applies all migrations without seeding contacts or campaigns, and does not reset an existing user's password. The database role needs permission to create the vector extension. `db:setup` refuses to run when `NODE_ENV=production`.

For later releases, back up the database, stop application processes, and run `bun run db:migrate` from the new image. Restart the web process and both workers only after successful migration. Do not run schema migrations on every container restart.

## Running the image

```sh
docker build -t newsletter:local .
docker run --rm -p 3000:3000 --env-file /path/to/production-test.env newsletter:local
# Run both persistent workers with the same database and settings:
docker run --rm --env-file /path/to/production-test.env newsletter:local bun scripts/worker.ts
docker run --rm --env-file /path/to/production-test.env newsletter:local bun scripts/knowledge-worker.ts
```

Use a network-reachable hostname in `DATABASE_URL`; `localhost` inside a container is not the host machine. The Docker build excludes `.env` files, backups, Git metadata, and host dependencies. Run one instance of each process for this MVP.

`/health/live` checks the HTTP process. `/health/ready` checks database access and the base users table with a three-second timeout. Use readiness failure to remove traffic, not to restart the process during a database outage. Successful migration remains a release prerequisite.

SIGTERM stops workers claiming more jobs and allows their current job to finish. Give workers sufficient termination grace (for example, 120 seconds). Forced termination can still interrupt long jobs. Deliveries left in `processing` are intentionally not resent automatically because SES submissions are not idempotent. Knowledge jobs interrupted for ten minutes become errors on the next worker poll and can be retried in the UI. See the root README for remaining MVP limitations.
