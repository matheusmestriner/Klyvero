# Database and migrations

The schema lives in `apps/api/prisma/schema.prisma`. Versioned SQL migrations live in `apps/api/prisma/migrations`
(`0001_baseline` is the whole schema as of the first migration).

## New database (local, docker compose, a fresh Render database)

```bash
pnpm --filter @klyvero/api prisma:migrate     # prisma migrate deploy: applies every pending migration
```

The API container does this on start (`apps/api/Dockerfile`).

## Changing the schema

```bash
# edit apps/api/prisma/schema.prisma, then, with DATABASE_URL pointing at a throw-away local database:
pnpm --filter @klyvero/api exec prisma migrate dev --name what_changed
```

Commit the generated folder under `prisma/migrations`. CI applies all migrations to an empty database and fails when
the result differs from `schema.prisma` (`prisma migrate diff --exit-code`), so a schema edit without a migration is
caught before merge.

## Database that already exists (the current Render database)

That database was created with `prisma db push`, so it has the tables but no `_prisma_migrations` history. The Render
build still runs `db:push` (see `render.yaml`) and keeps working. To move it to migrations:

1. Take a backup.
2. Mark the baseline as applied, once, from a shell with the production `DATABASE_URL`:
   `pnpm --filter @klyvero/api exec prisma migrate resolve --applied 0001_baseline`
3. In `render.yaml`, replace `db:push` with `prisma:migrate` in the API `buildCommand`.

The baseline was verified to produce exactly the same structure as `db push` (`prisma migrate diff` reports no
difference), so step 2 does not hide any drift.
