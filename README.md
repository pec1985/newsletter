# Postscript

A self-hostable, AI-assisted newsletter workspace. Draft campaigns in Markdown, translate them per locale with your own LLM, send through AWS SES, and track opens and unsubscribes — all from a single workspace you run yourself.

## Features

- **Markdown campaign editor** with `{{name}}` personalization and sanitized HTML / plain-text previews.
- **Per-locale translation** using any OpenAI-compatible model, with per-language review and approval before anything is sent.
- **Immutable, signed language versions** — send immediately or schedule for a future time in your own timezone.
- **AWS SES delivery** through a background worker, with open tracking and RFC 8058 one-click unsubscribe headers.
- **Contacts management** with a bulk JSON API (up to 20,000 contacts per import), consent handling, and revocable bearer keys.
- **Retrieval-augmented drafting** from an uploaded knowledge base, embedded with pgvector.
- **Per-campaign AI spend accounting** and pluggable image hosting (local Postgres or ImageKit).

Built with SvelteKit, TypeScript, Tailwind, Bun, and Postgres.

## Quick start

```bash
bun install
docker compose up -d --build --wait
cp .env.example .env              # then set SETTINGS_ENCRYPTION_KEY (openssl rand -hex 32)
bun run db:setup
bun run dev -- --host 127.0.0.1   # in a second terminal, run: bun run worker
```

Open <http://127.0.0.1:5173> and sign in with **admin / admin** (local testing only). See [Getting started](docs/getting-started.md) for the full walkthrough.

## Documentation

- [Getting started](docs/getting-started.md) — local setup, running the app, and verification.
- [Campaign workflow](docs/workflow.md) — drafting, translating, reviewing, sending, and navigation.
- [Scheduled sending](docs/scheduling.md) — deadlines and future-dated delivery.
- [Integrations](docs/integrations.md) — AI engine, AWS SES, image hosting, and connection validation.
- [Knowledge base](docs/knowledge-base.md) — company context and retrieval-augmented drafting.
- [AI spending](docs/ai-spending.md) — token accounting and cost estimates.
- [Contacts API](docs/contacts-api.md) — the bulk contacts API and API key management.
- [Status and limitations](docs/limitations.md) — MVP boundaries and email deliverability notes.
- [Container deployment](deploy/README.md) — Docker builds and GHCR publishing.

## License

Copyright (C) 2026 Pedro Enrique.

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License v3.0** as published by the Free Software Foundation. See [LICENSE](LICENSE) for the full text.

If you run a modified version of this software as a network service, the AGPL requires you to offer its users the corresponding source code of your modified version.
