# Getting started

Local setup, running the app, and verifying a checkout.

## Local development

```bash
bun install
docker compose up -d --build --wait
```

Copy `.env.example` to `.env`. Set `SETTINGS_ENCRYPTION_KEY` to a random 32-byte hex key (generate with `openssl rand -hex 32`). Keep the key stable: it encrypts integration credentials stored in Postgres.

```bash
bun run db:setup
bun run dev -- --host 127.0.0.1
```

In a second terminal:

```bash
bun run worker
```

Open <http://127.0.0.1:5173> and sign in with **admin / admin**. The setup script is idempotent and creates two example drafts and six contacts at example.com. These credentials and the seed script are for local testing only.

Postgres runs on localhost port **55450**, with a persistent Docker volume. The app uses port **5173**. Stopping the container preserves the database.

## Verification

```bash
bun run format
bun run check
bun test
bun scripts/smoke.ts
bun run build
```

The smoke test requires the dev server, database, worker, and local test account. It creates isolated test records and removes them afterward. Run it before adding an ImageKit key, since otherwise its upload would use ImageKit.

Feature-specific regression scripts are documented alongside the features they cover: see [Integrations](integrations.md), [Knowledge base](knowledge-base.md), [Scheduled sending](scheduling.md), and the [Contacts API](contacts-api.md).
