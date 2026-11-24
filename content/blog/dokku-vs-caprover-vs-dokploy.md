---
title: "Dokku vs CapRover vs Dokploy: Which Self-Hosted PaaS Should You Use?"
seoTitle: "Dokku vs Dokploy vs CapRover (2026): Git Push, Swarm, Backups and How to Switch"
description: "Dokku vs Dokploy and CapRover vs Dokploy compared: Dokku is git push with no free dashboard, CapRover is a simple web UI with limited Docker Compose, and Dokploy is a free dashboard with Compose, templates and S3 backups. How to move your apps to Dokploy."
date: "2026-11-24"
keywords: "dokku vs dokploy, caprover vs dokploy, dokku vs caprover, dokku, caprover, dokku alternative, caprover alternative, move from dokku to dokploy, move from caprover to dokploy, self hosted paas, dokploy"
---

If you're comparing Dokku vs Dokploy, or CapRover vs Dokploy, here's the short answer. All three turn a VPS into your own little Heroku: you deploy apps, add databases, and get domains with HTTPS. **Dokku** is the terminal one: you `git push` and it builds and runs your app, but the free version has no dashboard. **CapRover** is a simple web dashboard on Docker Swarm with 300+ one-click apps, but its Docker Compose support is limited and experimental. **Dokploy** is a free, open source dashboard that deploys from Git, Docker images and full Docker Compose files, with 600+ templates and scheduled database backups to S3 built in.

I use Dokploy. Below is how the three compare, when Dokku or CapRover is still the better pick, and how to move your apps to Dokploy step by step. At the end I show the easier way, where I asked Claude to show me how every app on my Dokploy gets deployed.

## Dokku vs CapRover vs Dokploy at a glance

| | Dokku | CapRover | Dokploy |
|---|---|---|---|
| License | MIT | Apache 2.0 | Apache 2.0 core, a few paid enterprise parts |
| Price to self-host | Free (web UI is Dokku Pro, $999 one-time) | Free | Free |
| How you deploy | `git push`, Docker image, archive | Web UI, `caprover deploy` CLI, Git webhook, image | Web UI: Git (GitHub, GitLab, Bitbucket, Gitea, any Git URL), Docker image, Docker Compose |
| Dashboard | Only with Dokku Pro | Yes | Yes |
| Docker Compose | No | Experimental import of a few fields | Yes, full Compose files |
| One-click apps | No catalog | 300+ | 600+ templates |
| Builders | Heroku buildpacks, Cloud Native Buildpacks, Dockerfile | Dockerfile or image, through a `captain-definition` file | Nixpacks, Dockerfile, Railpack, Heroku and Paketo buildpacks, static |
| Proxy | NGINX | NGINX | Traefik |
| Several servers | Optional k3s scheduler | Docker Swarm | Remote servers and Docker Swarm |
| Scheduled database backups | Per-plugin commands (e.g. `postgres:backup-schedule`) | Not built in for app data | Built in, to any S3 bucket |

Dokku and CapRover facts come from their own sites and docs (November 2026). Dokku is on the 0.38 line. CapRover's GitHub repo has about 15,000 stars.

## Dokku vs Dokploy

Dokku has been around since 2013 and it's very good at one thing: `git push dokku main`, and your app is built with buildpacks or your Dockerfile and running behind NGINX. Databases and Let's Encrypt are plugins you install, and you drive everything with `dokku` commands over SSH.

The free version has no dashboard. The web UI and a REST API are **Dokku Pro**, a one-time lifetime license that just went up to $999, for one production server and two pre-production ones. It's a fair price for what it is, but it's not free.

Dokploy is the other way round: the dashboard is the product, and it's free. You still get push-to-deploy: connect a Git repo, turn on **Autodeploy**, and every push redeploys. What you lose is the pure terminal flow. What you gain is Docker Compose, a template catalog, built-in backups to S3, and a screen that shows every app, its logs and its domains.

**Pick Dokku** if you live in the terminal, deploy single apps, and liked Heroku exactly as it was. **Pick Dokploy** if you want to click, run Compose stacks, or install apps like n8n and Supabase from a template.

## CapRover vs Dokploy

CapRover is the closest to Dokploy. Both have a web dashboard, both run on Docker Swarm, both can add worker servers, and both give you Let's Encrypt certificates. CapRover uses NGINX, Dokploy uses Traefik.

The big difference is Docker Compose. CapRover's own docs call its Compose import experimental: it reads only `image`, `environment`, `ports`, `volumes`, `depends_on`, `hostname`, `cap_add` and `command`, and ignores the rest, including `build`. Most self-hosted apps today ship as a Compose file, so on CapRover you often rebuild them as separate one-click apps by hand. Dokploy runs the Compose file as it is.

The second difference is backups. CapRover can back up its own configuration, but your databases are one-click apps and their data is yours to back up. In Dokploy, you open a database, pick an S3 bucket and a schedule, and you're done.

**Pick CapRover** if your apps are single containers and you like its calm, simple UI. **Pick Dokploy** if you run Compose stacks or want scheduled backups without writing cron jobs.

## Can I run Dokku or CapRover and Dokploy on the same server?

No. CapRover and Dokploy both want ports 80, 443 and 3000 and both set up Docker Swarm. Dokku's NGINX wants 80 and 443 too. Use a fresh VPS for Dokploy, move one app at a time, and switch each app's DNS record when it's ready.

## How to move from Dokku or CapRover to Dokploy

### What you need

- **A new VPS** with at least 2 GB of RAM and 30 GB of disk. Hetzner, DigitalOcean, Hostinger and others all work.
- **Ports 80, 443 and 3000 free** on it.
- **SSH access to your old server**, to export settings and dump databases.

### Step 1: Install Dokploy

SSH into the new server and run:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://your-server-ip:3000` and create your admin account.

### Step 2: Write down what the old server runs

On **Dokku**, for each app:

```bash
dokku apps:list
dokku config:export --format envfile myapp > myapp.env
dokku domains:report myapp
dokku ports:report myapp
dokku storage:list myapp
```

That gives you the environment variables, domains, the port the app listens on, and any mounted folders with data.

On **CapRover**, open each app in the dashboard and copy its **Environmental Variables** and **Persistent Directories** from the **App Configs** tab, and its domains from **HTTP Settings**. Note how it deploys: a Git repo, an image, or a one-click app.

### Step 3: Create the databases in Dokploy

1. Create a project.
2. Click **Create Service**, then **Database**, and pick the same engine (PostgreSQL, MySQL, MariaDB, MongoDB or Redis).
3. Set a name, database name, user and password. Pick a version at least as new as the old one, so the restore works.
4. Click **Deploy**.

The database page shows an **Internal Connection URL**. Your apps use that, and it never leaves the server.

### Step 4: Move the data

On **Dokku** with the Postgres plugin, export the database:

```bash
dokku postgres:export mydb > app.dump
scp app.dump root@new-server-ip:/root/
```

On **CapRover**, a one-click database runs as a Swarm service called `srv-captain--` plus the app's name. Dump it from its container:

```bash
docker ps --format '{{.Names}}' | grep srv-captain--mydb
docker exec CONTAINER pg_dump -U your_user -Fc your_db > app.dump
scp app.dump root@new-server-ip:/root/
```

Then on the Dokploy server, restore into the new database (its container name starts with the **App Name** shown on the database's page):

```bash
docker ps --format '{{.Names}}' | grep your-dokploy-db-app-name
docker cp /root/app.dump CONTAINER:/tmp/app.dump
docker exec -it CONTAINER pg_restore -U your_user -d your_db --no-owner --no-acl /tmp/app.dump
```

Stop the app on the old server first if it writes all day, so the dump is the last word.

### Step 5: Deploy each app

1. In the project, click **Create Service** and pick what you had:
   - **Application** for a Git repo or a Docker image. In **Provider**, pick GitHub (connect it once in Dokploy's Git settings) or another Git source, then the repo and branch.
   - **Compose** for a Docker Compose file. Choose **Raw** to paste it, or point it at a Git repo.
   - **Template** if it was a CapRover one-click app. Search Dokploy's list first.
2. In **Build Type**, pick **Dockerfile** if the repo has one. Coming from Dokku with buildpacks, try **Heroku Buildpacks** or the default **Nixpacks**.
3. Paste the variables into the **Environment** tab. Replace the old database URL with the Internal Connection URL from Step 3.
4. Click **Deploy** and watch the logs.
5. Turn on **Autodeploy**. With the GitHub provider, every push redeploys. For any other Git source, copy the webhook URL from the app's **Deployments** tab into your Git host's webhook settings. That's your new `git push dokku main`.

### Step 6: Add the domain with HTTPS

1. Open the service's **Domains** tab and click **Add Domain**.
2. Type the host, like `app.yourdomain.com`, and the **container port** the app listens on (the one `ports:report` or CapRover's HTTP settings showed you). For a Compose service, also pick the service name.
3. Turn on **HTTPS** and choose **Let's Encrypt**.
4. At your DNS provider, point the host's A record at the new server's IP. On Cloudflare, keep it **DNS only** (grey cloud) until the certificate is issued.

### Step 7: Set up backups

1. Add your S3 bucket (AWS, Cloudflare R2, Backblaze B2 and others work) in Dokploy's settings under **S3 Destinations**.
2. Open each database's **Backups** tab, pick that destination, set a schedule and how many backups to keep.
3. Add a notification channel (Slack, Discord, Telegram or email) in Dokploy's settings so a failed backup reaches you.

When everything answers on the new server, keep the old one a few days before you delete it.

## The easier way: just ask Claude

If you're coming from Dokku, the thing you'll miss is knowing exactly how an app gets deployed, because you typed it. A dashboard hides that behind tabs. So you can skip learning where Dokploy keeps everything by connecting it to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

I asked:

> I'm used to git push dokku main. Show me how each app on my Dokploy gets deployed: where the code comes from, how it's built, whether a push redeploys it, and whether the last deploy worked. Don't change anything.

Here's what happened:

1. Claude searched Zeqqat for "list all projects with applications" and listed everything: **14 projects** with 6 apps, 8 Compose stacks and 6 Postgres databases.
2. It opened each app (one read call per app) and pulled out the parts that matter when you come from Dokku. All read only.

This is what came back:

```
Source                  5 apps from a Git URL, 1 from a Docker image
Build                   4 Dockerfile, 1 Nixpacks
Redeploy on push        on for all 6 (trigger: push)
Last deploy             5 OK, 1 never deployed successfully (2 of 2 failed)
HTTPS                   4 with Let's Encrypt, 1 plain http, 1 no domain
```

Two things I hadn't noticed. The app that never deployed has no domain either, so it had been sitting there as "idle" since July, and I'd forgotten it existed. And one test app answered only on plain http, with no certificate, because I'd left HTTPS off when I added its domain.

Each app also has a deploy webhook token. In Dokploy that token is the secret part of the webhook URL: anyone with it can trigger a deploy. Claude never saw it. It came back as a `{{zq_secret_...}}` handle, and so did every secret in the apps' environment variables.

Then I asked what it would take to create a new app from a repo, the Dokploy way. Claude looked it up rather than guessing: create the application, set its Git source (any Git URL and branch, or GitHub, GitLab, Gitea or Bitbucket), pick the build type, add a domain, then deploy. So "deploy this repo at app.mydomain.com with HTTPS" is one sentence, the same way `git push` was.

My Zeqqat connection allows reading, creating and editing, but delete is switched off, so Claude can set things up and can't remove anything. And every call carried the same one-line reason, so the activity log shows the whole check as one request.

## What I took from it

Dokku is still the purest `git push` experience, and CapRover is still a calm little dashboard for single containers. But if you run Docker Compose stacks, want one-click templates, or want backups without writing cron jobs, Dokploy does all of it for free. Moving is an afternoon: new VPS, databases first, then apps, domains and backups. And if you miss typing commands, you can type sentences to your AI instead.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Is Dokku better than Dokploy?

Not better or worse, different. Dokku is `git push` from the terminal with buildpacks and NGINX, and its web UI is the paid Dokku Pro. Dokploy is a free web dashboard with Docker Compose, 600+ templates and scheduled S3 backups, and it can still redeploy on every push. If you never want a dashboard, Dokku is great. If you do, Dokploy is free.

### Does CapRover support Docker Compose?

Only partly. CapRover's docs call its Compose import experimental. It reads a short list of fields (`image`, `environment`, `ports`, `volumes`, `depends_on`, `hostname`, `cap_add`, `command`) and ignores the rest, including `build`. Dokploy runs full Docker Compose files.

### Is Dokku free?

Yes. Dokku is MIT licensed and free to self-host. The web UI and REST API are part of Dokku Pro, a one-time lifetime license priced at $999 as of its 1.5.0 release.
