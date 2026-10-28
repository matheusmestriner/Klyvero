# Klyvero

AI sales OS: prospecting, CRM, e-mail and WhatsApp campaigns, inbox, calendar and agents.

| Path | What |
| --- | --- |
| `apps/api` | NestJS 11 + Prisma + PostgreSQL. Multi-tenant REST API under `/api/v1` |
| `apps/web` | Next.js 15 web app |
| `apps/mobile` | Expo app (Inbox, Leads, Agenda, push). Own npm lockfile, see its README |
| `services/whatsapp` | Go bridge to WhatsApp (whatsmeow), called by the API |
| `packages/contracts` | Shared types |
| `docs` | [Campaign engine](docs/campaigns.md), [database and migrations](docs/database.md), [owner sign-up (white label)](docs/signup.md) |

## Run locally

```bash
cp .env.example .env              # fill in the secrets; RUN-KLYVERO.ps1 does this for you on Windows
docker compose up --build         # postgres, redis, mailpit, whatsapp, api (:4000), web (:3000)
```

Without Docker: `pnpm install`, point `DATABASE_URL` at a PostgreSQL, run `pnpm db:migrate`, then `pnpm dev`.

## Checks

```bash
pnpm contract:check                                  # every route the web and mobile apps call exists in the API
pnpm --filter @klyvero/api test                      # unit tests
DATABASE_URL=... pnpm --filter @klyvero/api test:e2e # end-to-end tests against a real PostgreSQL (campaigns, mobile)
pnpm --filter @klyvero/web lint && pnpm --filter @klyvero/web build
```

CI (`.github/workflows/security.yml`) runs all of the above, the Go tests, the migration check and the mobile job.

## Deploy

`render.yaml` describes the API service (Render free plan, no Redis: campaigns run from a database-backed scheduler,
see `docs/campaigns.md`). `BOOTSTRAP_ENABLED` can be switched to `false` once the first workspace exists.
