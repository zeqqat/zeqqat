---
title: "Preview Deployments with a Cloned Database in Dokploy"
seoTitle: "Dokploy Preview Deployments with a Database per Pull Request"
description: "Dokploy creates a preview app for every pull request, but not a database. Here is how to give each preview its own copy of a seed database, point it at the preview URL, and clean up afterwards."
date: "2026-11-03"
keywords: "dokploy preview deployments, dokploy preview database, dokploy DOKPLOY_DEPLOY_URL, preview environments database, dokploy pull request preview"
---

Dokploy's preview deployments spin up a fresh copy of your app for every pull request. What they don't do is spin up a database. Every preview either shares one database or has none, which is exactly the question in this [Dokploy support thread](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1470888175118323968): how do you give each preview its own copy of the database, and how does the app know its own preview URL?

Dokploy answers the second question out of the box. For the first, you need a small script. This post covers both, plus cleanup.

## What Dokploy gives you

From the [preview deployments docs](https://docs.dokploy.com/docs/core/applications/preview-deployments):

- Previews are for **applications connected through GitHub**. Turn them on per application.
- A preview is created when a pull request targets your configured branch, optionally filtered by labels. Every new commit redeploys it, and it's removed when the pull request is closed or merged.
- Each preview gets its own domain: a free `traefik.me` address by default, or one under a wildcard domain you own.
- The default limit is 3 previews per application.

Two details matter for databases:

- **Previews have their own environment variables.** We checked Dokploy's source: when it deploys a preview, it uses the preview's environment block, not the main one ([application.ts](https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/services/application.ts)). So you can give previews a different `DATABASE_URL` without touching production.
- **Docker Compose services don't get previews.** In Dokploy's database schema, a preview deployment belongs to an application, and there's no equivalent for Compose. If your app is a Compose stack, you'd need to split the web service into an application to use previews.

## Telling the app its own URL

The thread's follow-up question was how an app like phpBB, which needs its absolute base URL, can find out where it's running. Dokploy injects **`DOKPLOY_DEPLOY_URL`** into every preview: as an environment variable, a build argument and a build secret, set to the preview's hostname. The [variables docs](https://docs.dokploy.com/docs/core/variables) show how to use it in the preview environment:

```bash
APP_URL=https://${{DOKPLOY_DEPLOY_URL}}
```

The value is a hostname without a scheme, so add `https://` (or `http://` if you haven't enabled HTTPS for previews) yourself.

## A database per preview

The approach:

1. Keep a **seed database** on a Postgres server you run in Dokploy. It holds your schema and safe test data.
2. When a preview container starts, a script **creates a database for that preview** by copying the seed, unless it already exists.
3. The script points `DATABASE_URL` at the new database, then starts your app.
4. A **scheduled job** drops preview databases after a while.

### Don't clone production

It's tempting to copy the production database so previews have realistic data. Don't. Preview URLs are easy to share and previews often run unreviewed code. Build the seed from your migrations plus a seed script, or from a dump you've scrubbed of personal data.

### Step 1: Create the seed database

In Dokploy, create a Postgres database for previews (separate from production). Connect to its default `postgres` database and run:

```sql
CREATE DATABASE app_seed;
-- Run your migrations and seed data against app_seed, then:

CREATE TABLE preview_databases (
  name text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

The `preview_databases` table lives in the default `postgres` database. It records which databases the script created, so cleanup can't touch anything else.

We use Postgres's `CREATE DATABASE ... TEMPLATE` because it copies a whole database in one statement, much faster than a dump and restore. It has one rule, from the [Postgres docs](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html): **no other session can be connected to the template while it's copied**. That's why the seed is its own database that nothing else uses.

### Step 2: Add a startup script to your app

Save this as `preview-db.sh` in your repository:

```sh
#!/bin/sh
set -eu

# Only previews have DOKPLOY_DEPLOY_URL, so normal deploys skip all of this.
if [ -n "${DOKPLOY_DEPLOY_URL:-}" ]; then
  # Turn the preview hostname into a safe database name (max 63 characters).
  LABEL=$(echo "$DOKPLOY_DEPLOY_URL" | cut -d. -f1 | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '_' | cut -c1-55)
  DB_NAME="preview_${LABEL}"

  EXISTS=$(psql "$PREVIEW_PG_ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")
  if [ "$EXISTS" != "1" ]; then
    psql "$PREVIEW_PG_ADMIN_URL" -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE \"${DB_NAME}\" TEMPLATE \"${PREVIEW_SEED_DB}\""
    psql "$PREVIEW_PG_ADMIN_URL" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO preview_databases (name) VALUES ('${DB_NAME}') ON CONFLICT DO NOTHING"
  fi

  export DATABASE_URL="${PREVIEW_PG_BASE_URL}/${DB_NAME}"
fi

exec "$@"
```

The name is built only from lowercase letters, digits and underscores, so it's safe to put in SQL. The script needs the Postgres client (`psql`) in your image, for example `apt-get install -y postgresql-client` in a Debian-based Dockerfile.

Then run your app through it. With a Dockerfile:

```dockerfile
COPY preview-db.sh /usr/local/bin/preview-db.sh
RUN chmod +x /usr/local/bin/preview-db.sh
ENTRYPOINT ["preview-db.sh"]
CMD ["npm", "start"]
```

If your start command also runs migrations, the preview's database gets any new migrations from the pull request on top of the seed.

### Step 3: Set the preview environment

In the application's preview deployment settings, add these to the preview environment (not the main one):

```bash
# Superuser connection to the preview Postgres server, default database
PREVIEW_PG_ADMIN_URL=postgresql://postgres:<password>@<internal-host>:5432/postgres
# Same server and credentials, without a database name
PREVIEW_PG_BASE_URL=postgresql://postgres:<password>@<internal-host>:5432
PREVIEW_SEED_DB=app_seed
APP_URL=https://${{DOKPLOY_DEPLOY_URL}}
```

Use the internal host, user and password from the database's page in Dokploy, so traffic stays on the server's Docker network. The examples here say `postgres` for the user; replace it with yours. Using the superuser keeps the example short. In a real setup, create a role with `CREATEDB` and use that instead.

### Step 4: Clean up old preview databases

Dokploy removes the preview app when the pull request closes, but it doesn't know about the database the script made. Use a [schedule job](https://docs.dokploy.com/docs/core/schedule-jobs). A **Server Job** runs a bash script on the host, so it can reach the Postgres container:

```bash
#!/bin/bash
set -euo pipefail

# Replace with your preview Postgres app name from Dokploy,
# and "postgres" below with your database user.
PG=$(docker ps -q -f name=<preview-postgres-app-name> | head -n1)
DAYS=14

docker exec "$PG" psql -U postgres -d postgres -tAc \
  "SELECT name FROM preview_databases WHERE created_at < now() - interval '${DAYS} days'" |
while read -r db; do
  [ -n "$db" ] || continue
  docker exec "$PG" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"${db}\" WITH (FORCE)"
  docker exec "$PG" psql -U postgres -d postgres -c "DELETE FROM preview_databases WHERE name = '${db}'"
done
```

Schedule it daily, for example `0 3 * * *`. `DROP DATABASE ... WITH (FORCE)` closes open connections first and needs Postgres 13 or newer ([docs](https://www.postgresql.org/docs/current/sql-dropdatabase.html)).

The trade-off: a pull request that stays open longer than `DAYS` loses its database. The next time that preview restarts, the script creates a fresh one from the seed. For most teams that's fine. If not, raise `DAYS`.

## Refreshing the seed

When your schema changes on the main branch, the seed falls behind. Previews still work if their start command runs migrations, but startup gets slower over time. Rebuild the seed occasionally: drop `app_seed`, recreate it, and run migrations and seed data again. A second schedule job can do this weekly.

## FAQ

### Do Dokploy preview deployments create a database?

No. Dokploy creates a preview copy of the application only. You can add a database per preview with a startup script that copies a seed database, as shown above.

### How does a Dokploy preview know its own URL?

Dokploy sets DOKPLOY_DEPLOY_URL to the preview's hostname as an environment variable, build argument and build secret. Reference it in the preview environment, for example APP_URL=https://${{DOKPLOY_DEPLOY_URL}}.

### Can Docker Compose services have preview deployments in Dokploy?

Not currently. Preview deployments belong to applications connected through GitHub. To use them, deploy the web service as an application.

### Should preview databases be copies of production?

No. Previews run unreviewed code on shareable URLs. Copy a seed database built from migrations and test data, or a dump scrubbed of personal information.

## Sources

- [Dokploy Discord: Preview deployments with a database](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1470888175118323968)
- [Dokploy docs: Preview deployments](https://docs.dokploy.com/docs/core/applications/preview-deployments)
- [Dokploy docs: Variables](https://docs.dokploy.com/docs/core/variables)
- [Dokploy docs: Schedule jobs](https://docs.dokploy.com/docs/core/schedule-jobs)
- [Dokploy source: preview environment and DOKPLOY_DEPLOY_URL](https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/services/application.ts)
- [PostgreSQL docs: Template databases](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html)
- [PostgreSQL docs: DROP DATABASE](https://www.postgresql.org/docs/current/sql-dropdatabase.html)
