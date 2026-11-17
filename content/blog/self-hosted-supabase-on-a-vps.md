---
title: "Self-Hosted Supabase on Your Own VPS (with Backups That Actually Work)"
seoTitle: "Self Hosted Supabase on a VPS: Dokploy Template, HTTPS, Email and Backups"
description: "How to run self hosted Supabase on a VPS: install Dokploy, deploy the Supabase template, add your domain and email, and set up the database backup a volume backup misses."
date: "2026-11-17"
keywords: "self hosted supabase, self host supabase, supabase vps, self hosted supabase backup, supabase docker compose, supabase dokploy, supabase self hosted smtp, supabase studio password"
---

If you want self hosted Supabase on your own VPS, here's the short answer: rent a Linux server, install Dokploy on it, and deploy Supabase from Dokploy's template. You get the whole stack (Postgres, Auth, Storage, Realtime, Edge Functions and the Studio dashboard) on your own domain with HTTPS, and every secret is generated for you. Then you need two more things the template can't do for you: real email, and a database backup. I'll show both.

I'll go step by step, written for someone who has never self-hosted anything. Then I'll show the easier way, where I asked Claude to check the template for me.

## What you need

- **A VPS.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk, but Supabase is not one app. The template runs 11 containers. I'd pick 4 GB of RAM at the very least, and 8 GB if real users will hit it. Hetzner, DigitalOcean, Hostinger and others all work. Choose Ubuntu or Debian.
- **A domain** you can add a DNS record to. Supabase's auth and the dashboard both want HTTPS.
- **An email provider with SMTP** (Resend, Postmark, Amazon SES, Brevo, your own mail server). Without it, sign-up confirmation emails go nowhere.
- **An S3-compatible bucket** for backups (Cloudflare R2, Backblaze B2, AWS S3, MinIO).

## Step 1: Install Dokploy

SSH into your server and run Dokploy's install script:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Ports 80, 443 and 3000 must be free first, or the install fails. When it finishes, open `http://your-server-ip:3000` and create your admin account.

## Step 2: Deploy the Supabase template

Dokploy has a gallery of one-click templates. My Dokploy lists 602 of them, and two are Supabase:

| Template | Listed version | Use it? |
| --- | --- | --- |
| **SupaBase** | 2026.08.03-3, for Dokploy 0.22.5 and newer | Yes |
| **SupaBase** (older) | 1.25.04, for Dokploy older than 0.22.5 | Only on an old Dokploy |

They have the same name, so read the version line before you click. A fresh Dokploy install is newer than 0.22.5, so you want the first one.

1. Create a project (call it anything, like "backend").
2. Inside it, click **Create Service**, choose **Template**, search for **Supabase** and create the current one.

Dokploy creates a Docker Compose service with Studio, an Envoy API gateway, Auth, PostgREST, Realtime, Storage, imgproxy, postgres-meta, Edge Functions, Postgres 17 and the Supavisor connection pooler. It also generates every secret: the Postgres password, the JWT secret, the anon and service role keys signed with it, and a 32-character Studio password. You don't have to run any key generator yourself. Don't deploy yet.

## Step 3: Add your domain with HTTPS

The template points its one domain at the gateway (service `api-gw`, port `8000`). Everything goes through it: your app's API calls, auth, storage, and the Studio dashboard.

1. At your DNS provider, add an **A record** (for example `supabase.yourdomain.com`) pointing to your server's IP. If you use Cloudflare, set it to DNS only (grey cloud) so Let's Encrypt can reach your server.
2. In Dokploy, open the service's **Domains** tab and edit the domain: host `supabase.yourdomain.com`, service `api-gw`, port `8000`, turn on **HTTPS**, and pick **Let's Encrypt**.
3. In the **Environment** tab, change the three URLs that carry the domain to match: `SUPABASE_PUBLIC_URL=https://supabase.yourdomain.com`, `API_EXTERNAL_URL=https://supabase.yourdomain.com/auth/v1`, and the first entry of `ADDITIONAL_REDIRECT_URLS`.

The template fills those URLs with `https://` already, even for the free generated domain, which is HTTP only. That's why it's worth doing this before the first deploy.

## Step 4: Set up email and your site URL

This is the step most guides skip, and it's why "I signed up but never got the email" is such a common self-hosted Supabase question.

The template ships with placeholder mail settings: `SMTP_HOST=supabase-mail`, user `fake_mail_user`. There is no `supabase-mail` container in the template. Email confirmation is on (`ENABLE_EMAIL_AUTOCONFIRM=false`), so a new user signs up, Auth tries to send the confirmation email, and nothing arrives.

In the **Environment** tab, replace these with your provider's values:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `SMTP_ADMIN_EMAIL` (the From address) and `SMTP_SENDER_NAME`

While you're there, set `SITE_URL` to the address of your app (the website that uses Supabase), not Supabase itself. It defaults to `http://localhost:3000`, and that's where confirmation and password reset links will send people until you change it.

Then click **Deploy**. The first start takes a few minutes while 11 images download.

## Step 5: Open Studio and get your keys

Open `https://supabase.yourdomain.com`. Your browser asks for a username and password. That's the gateway protecting Studio:

- username: `supabase` (`DASHBOARD_USERNAME`)
- password: the generated `DASHBOARD_PASSWORD` in the Environment tab

Your app needs two values from the Environment tab: the URL (`https://supabase.yourdomain.com`) and `ANON_KEY` (or the newer `SUPABASE_PUBLISHABLE_KEY`). Those are safe in a browser. `SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY` bypass every row-level security rule, so they stay on your server and never go in frontend code.

## Self-hosted Supabase backup: the part a volume backup misses

Here's the trap. Dokploy has **Volume Backups**, and it's natural to assume they cover your Supabase data. They don't. Dokploy's docs say volume backups "only work with Docker named volumes, not with bind mounts (like the `../files` folder)". The Supabase template keeps the Postgres data in exactly that kind of folder (`../files/volumes/db/data`), and uploaded files too (`../files/volumes/storage`).

What does work is Dokploy's backup for a database inside a Compose service:

1. Add your bucket once in Dokploy's settings, under **S3 Destinations**.
2. Open the Supabase service and go to its **Backups** tab.
3. Create a backup with **Database Type** PostgreSQL, **Service Name** `db` (the service in the template's Compose file that runs Postgres), **Database** `postgres`, your destination, a schedule (for example `0 3 * * *` for every night at 3:00), and how many to keep.
4. Click **Run Manual Backup** once and check the file lands in your bucket. A backup you've never seen is a guess.

That covers your tables, your auth users, and the metadata about storage objects. It doesn't cover the uploaded files themselves, because they sit in a bind-mounted folder on disk. If you store files users care about, the template supports an S3 storage backend: set `STORAGE_BACKEND` to `s3` in the Compose file and fill in the `GLOBAL_S3_*` values. Do that before the first upload. The template warns that changing `STORAGE_TENANT_ID` afterwards orphans every object.

Also keep a copy of `JWT_SECRET` and `VAULT_ENC_KEY` somewhere safe. If you restore the database onto a fresh install with new secrets, every key your apps use changes, and anything encrypted in Vault can't be read.

## No template? The Docker Compose route

Supabase publishes its own Docker Compose setup in the `docker` folder of its GitHub repository. You can paste that into Dokploy (**Create Service**, then **Compose**), but it expects a folder of SQL and config files next to it, and you have to generate the JWT secret and keys yourself. The Dokploy template already did all of that, including the config files, so I'd only go this route if you need something the template changed.

## The easier way: just ask Claude

Everything above is clicking through Dokploy. You can skip learning Dokploy entirely by connecting it to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, then paste Zeqqat's MCP URL into Claude as a connector. After that you say what you want.

Here's what I asked:

> Find the Supabase template in my Dokploy and preview what it would set up. Don't create anything.

Here's what happened, call by call:

1. Claude searched Zeqqat for "template" and found Dokploy's template tools: list templates, preview a template, deploy a template.
2. It listed the templates and found the two Supabase entries. That's where the table in Step 2 came from.
3. It ran Dokploy's preview on the template's variables, domain and environment. The preview is read only: Dokploy worked out what it would create without saving anything.

```
domains: api-gw, port 8000, <generated>.sslip.io
envs:
  SUPABASE_PUBLIC_URL=https://<generated>.sslip.io
  API_EXTERNAL_URL=https://<generated>.sslip.io/auth/v1
  SITE_URL=http://localhost:3000
  POSTGRES_PASSWORD={{zq_secret_lc5ben6bmq707m67}}
  JWT_SECRET={{zq_secret_9oocs3jbku4jk1zh}}
  ANON_KEY={{zq_secret_h7i1t7sw9j7y60kb}}
  SERVICE_ROLE_KEY={{zq_secret_2290syjls4ee9tpj}}
  DASHBOARD_USERNAME=supabase
  DASHBOARD_PASSWORD={{zq_secret_njfkymcb2kn8bksi}}
  SMTP_HOST=supabase-mail
  ENABLE_EMAIL_AUTOCONFIRM=false
```

The generated secrets never reached Claude: Zeqqat swapped them for `{{zq_secret_...}}` handles before the answer came back. For Supabase that matters a lot, because the JWT secret and service role key together are full control of your database. Claude can still pass a handle back to Dokploy when it deploys, without ever seeing the value.

Reading the plan, Claude flagged the same three things this guide does: the URLs say `https://` on a domain that's HTTP only, `SITE_URL` still points at localhost, and `SMTP_HOST` names a mail server that isn't in the template. Then I asked how I'd back it up, and it searched Zeqqat for "backup compose database" and found Dokploy's compose backup tools: one to schedule a backup to an S3 destination, one to run it now.

I stopped there. Deploying and scheduling the backup are each one more call, and my Zeqqat connection allows them because they create something new. Delete is switched off on that connection, so Claude can set things up but can't remove anything. Every call carried the same one-line reason, so in Zeqqat's activity log the whole thing shows up as one request I can read back.

## What I took from it

Self-hosted Supabase on a VPS is one template in Dokploy and a few settings: your domain on HTTPS with the matching URLs, real SMTP, the right `SITE_URL`, and a scheduled backup of the `db` service, not a volume backup. And if you'd rather not learn where all of those live, you can ask your AI to check them for you.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### How do I back up self-hosted Supabase?

Back up the Postgres database, not the Docker volume. In Dokploy, open the Supabase service's Backups tab and schedule a PostgreSQL backup of the `db` service and the `postgres` database to an S3 destination. Dokploy's volume backups skip bind-mounted folders, which is where the Supabase template keeps its data. Keep a copy of `JWT_SECRET` and `VAULT_ENC_KEY` too.

### Why am I not getting Supabase confirmation emails when self-hosting?

The self-hosted stack ships with placeholder SMTP settings, and email confirmation is on by default. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_ADMIN_EMAIL` to your email provider's values, and set `SITE_URL` to your app's address, then redeploy.

### What is the self-hosted Supabase Studio username and password?

On the Dokploy template the username is `supabase` and the password is the generated `DASHBOARD_PASSWORD` in the service's Environment tab. The gateway asks for them before it shows Studio.
