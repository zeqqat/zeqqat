# Contributing

Thanks for helping with Zeqqat.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Read `AGENTS.md`. It explains the domain model, naming rules and security posture, and coding agents read it too.

## Development

You need Node 22, pnpm 9 and Postgres.

```
cp .env.example .env    # fill in the values
pnpm install
pnpm dev
```

Migrations run on startup. After changing `db/schema.ts`, run `pnpm db:generate` and commit the new migration.

## Pull requests

- Run `pnpm check` (typecheck, lint, tests) before opening one.
- Keep each pull request to one change, and say how you tested it.
- Contributions are licensed under the Apache License 2.0, the same as the project.
