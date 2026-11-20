---
title: "Railway Alternatives You Can Self-Host, and How to Move Your App"
seoTitle: "Railway Alternatives (2026): Self-Host Your App and Postgres on a VPS with Dokploy"
description: "The Railway alternatives you can self-host in 2026, and how to move a Railway app and its Postgres database to your own VPS with Dokploy, step by step."
date: "2026-11-20"
keywords: "railway alternatives, railway alternative, railway alternative self hosted, railway app alternative, move off railway, railway to dokploy, railway postgres migration, railpack, self hosted paas, dokploy"
---

If you're looking for Railway alternatives you can self-host, the one I use is **Dokploy**. It gives you the part of Railway people like (connect a GitHub repo, add a Postgres database, set variables, get a domain with HTTPS) on a VPS you rent yourself. It's open source and free to run. It can even build your app with **Railpack**, the same open source builder Railway uses, so most apps move over without a Dockerfile.

Below is why people leave Railway, the other options, and how to move a typical Railway project (an app plus Postgres) to Dokploy, step by step. At the end I show the easier way, where I asked Claude to work out the move for me.

## Why people look for Railway alternatives

Railway is nice to use. People still leave, and three reasons come up most.

**The bill grows with every service.** Railway's Hobby plan is $5 a month and includes $5 of usage. After that you pay for what runs: $10 per GB of RAM per month, $20 per vCPU per month, $0.15 per GB of volume storage and $0.05 per GB of traffic out (Railway's own pricing page, November 2026). One always-on service holding 1 GB of RAM is $10 a month in memory alone. A VPS with 4 GB of RAM costs less than that at most providers, and you can run several apps on it.

**Outages you can't do anything about.** On May 19, 2026, Google Cloud suspended Railway's account and the whole platform was down for hours. Railway published an incident report. Nothing you did caused it, and nothing you could do fixed it.

**Owning your data.** Some people just want their database on a machine they control.

## Railway alternatives at a glance

| | Where it runs | Deploy from GitHub | Postgres built in | Domains and HTTPS |
|---|---|---|---|---|
| **Dokploy** | Your VPS | Yes, plus GitLab, Bitbucket, Gitea, any Git URL | Yes, plus MySQL, MariaDB, MongoDB, Redis, libSQL | Yes (Traefik, Let's Encrypt) |
| **Coolify** | Your VPS | Yes | Yes | Yes |
| **CapRover** | Your VPS | Through a webhook or its CLI | One-click apps | Yes |
| **Dokku** | Your VPS | `git push`, no dashboard | Through a plugin | Through a plugin |
| **Render, Fly.io** | Their cloud | Yes | Yes | Yes |

Render and Fly.io are hosted platforms like Railway, so you trade one bill for another. If you want to self-host, the closest match to Railway's dashboard is Dokploy or Coolify. I compared those two in [Coolify vs Dokploy](/blog/coolify-vs-dokploy), and the wider field in [Coolify alternatives](/blog/coolify-alternatives). The rest of this post is Dokploy.

## What you need

- **A VPS.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk. Ubuntu or Debian. Hetzner, DigitalOcean, Hostinger and others all work.
- **Ports 80, 443 and 3000 free.** Dokploy runs Traefik on 80 and 443 and its dashboard on 3000.
- **A domain** you can add DNS records to.

## Step 1: Install Dokploy

SSH into the server and run:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://your-server-ip:3000` and create your admin account.

## Step 2: Copy what's in Railway

For each Railway service, write down:

1. **The GitHub repo and branch** it deploys from.
2. **The variables.** In the service's **Variables** tab, the **Raw Editor** shows them all as text you can copy.
3. **Any start or build command** you set in its settings.

Keep Railway running until the very end. Nothing here touches it.

## Step 3: Create the Postgres database

Do the database first, because the app needs its address.

1. In Dokploy, create a project (call it anything).
2. Click **Create Service**, then **Database**, then **PostgreSQL**.
3. Give it a name, a database name, a user and a strong password. The default image is `postgres:18`. Pick a version at least as new as the one Railway runs, so the restore works.
4. Click **Deploy**.

On the database's page, Dokploy shows the **Internal Connection URL**. That's what your app will use. It never leaves the server's Docker network, so you don't need to open a port for it.

## Step 4: Move the data from Railway

In Railway, open the Postgres service's **Variables** and copy `DATABASE_PUBLIC_URL`. On your own computer (with a `pg_dump` at least as new as Railway's Postgres), run:

```bash
pg_dump "$DATABASE_PUBLIC_URL" -Fc --no-owner --no-acl -f railway.dump
scp railway.dump root@your-server-ip:/root/
```

Then on the server, find the database container and restore into it:

```bash
docker ps --format '{{.Names}}' | grep your-db-app-name
docker cp /root/railway.dump CONTAINER:/tmp/railway.dump
docker exec -it CONTAINER pg_restore -U your_user -d your_db --no-owner --no-acl /tmp/railway.dump
```

`your-db-app-name` is the **App Name** shown on the database's page in Dokploy. If your app writes to the database all day, stop it on Railway first so the dump is the last word.

## Step 5: Deploy the app from GitHub

1. In the same project, click **Create Service**, then **Application**.
2. In **Provider**, pick **GitHub** (connect your GitHub account once in Dokploy's Git settings), then the repo and branch.
3. In **Build Type**, pick **Railpack**, Railway's own builder. **Nixpacks**, Railway's older builder, is Dokploy's default and works too. If your repo has a Dockerfile, pick **Dockerfile**.
4. Open the **Environment** tab and paste the variables from Railway's Raw Editor.
5. Click **Deploy** and watch the logs.

Two things to fix while you paste:

- **Railway's reference variables don't exist in Dokploy.** A line like `DATABASE_URL=${{Postgres.DATABASE_URL}}` won't resolve. Replace it with the Internal Connection URL from Step 3. If several apps need it, put it once in the project's shared variables and write `DATABASE_URL=${{project.DATABASE_URL}}` in each app.
- **Set `PORT` yourself.** Railway hands your app a `PORT` variable. Add `PORT=3000` (or whatever your app listens on) so you know exactly which port to point the domain at.

Turn on **Autodeploy** and every push to that branch redeploys, like on Railway.

## Step 6: Add the domain with HTTPS

1. Open the app's **Domains** tab and click **Add Domain**.
2. Type the host, like `app.yourdomain.com`, and the **container port** (the `PORT` from Step 5).
3. Turn on **HTTPS** and choose **Let's Encrypt**.
4. At your DNS provider, add an A record for that host pointing to the server's IP. On Cloudflare, keep it **DNS only** (grey cloud) until the certificate is issued.

When the app answers on its new domain and the data looks right, delete the services on Railway.

## Step 7: Set up backups

Railway took care of this for you. On your own server, you do it once:

1. Add an S3 bucket (AWS, Cloudflare R2, Backblaze B2 and others work) in Dokploy's settings under **S3 Destinations**.
2. Open the database's **Backups** tab, pick that destination, set a schedule and how many backups to keep.

Then do a test restore. I wrote about why in [which of my databases were actually backed up](/blog/dokploy-database-backups-check).

## The easier way: just ask Claude

Everything above means learning where Dokploy keeps things. You can skip most of that by connecting Dokploy to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

Before moving anything, I asked:

> I'm moving a Node app and its Postgres database off Railway to my Dokploy. Work out exactly what Dokploy needs from me for each step. Don't create anything yet.

Here's what happened:

1. Claude checked my Dokploy's version first: `v0.31.2`.
2. It searched Zeqqat for "build type" and found the tool that sets how an app builds. Its options are `nixpacks`, `railpack`, `dockerfile`, `heroku_buildpacks`, `paketo_buildpacks` and `static`. It picked `railpack`, since that's Railway's own builder.
3. It searched for "create postgres database" and read what that tool needs: a name, a database name, a user, a password and the environment to put it in, with `postgres:18` as the default image.
4. For the password, it didn't make one up and it didn't ask me for one. It asked Zeqqat to generate it, and got back a handle instead of a value: `{{zq_secret_hyxd0m08cekmgwlg}}`. Zeqqat fills in the real password when the call runs. Claude never sees it, and neither does this blog post.
5. It found the rest of the chain: point the app at the GitHub repo and branch, set the environment variables, add the domain, deploy, and schedule backups to an S3 destination with how many to keep.

Its answer was a plan of nine calls, in order, with the two things I'd have missed flagged: swap `${{Postgres.DATABASE_URL}}` for the internal URL, and set `PORT`. The data copy (Step 4) is the one part it can't do through Dokploy, because that's `pg_dump` and `pg_restore` on the server, so it handed me those three commands.

My Zeqqat connection allows reading, creating and editing, but delete is switched off, so Claude can set things up and can't remove anything. Every call carried the same one-line reason, so the activity log shows the whole check as one request.

## What I took from it

Leaving Railway is less work than it looks. The app part is mostly the same: GitHub repo, Railpack, variables, a domain. The real changes are the database copy and the backups, which Railway did quietly for you. Do those two carefully, and the rest is an afternoon. And you don't have to learn Dokploy first if you'd rather ask your AI to do it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### What is the best self-hosted alternative to Railway?

Dokploy or Coolify. Both give you a dashboard on your own VPS where you deploy from GitHub, add Postgres or Redis, set variables and get HTTPS domains. Dokploy can also build with Railpack, the builder Railway uses, so most Railway apps build the same way without a Dockerfile.

### Is self-hosting cheaper than Railway?

Usually, once you have more than one always-on service. Railway charges $10 per GB of RAM per month on top of the plan fee, so a single service holding 1 GB costs about $10 a month in memory alone. A VPS with 4 GB of RAM costs less than that at most providers and can run several apps. In exchange, backups and updates become your job.

### How do I move a Postgres database off Railway?

Copy `DATABASE_PUBLIC_URL` from the Railway Postgres service, run `pg_dump` with it to make a dump file, copy the file to your server, and restore it with `pg_restore` into the new database. Use a Postgres version at least as new as Railway's on the new side, and stop writes to the old database while you copy.
