---
title: "Easypanel vs Dokploy: Which Self-Hosted Panel Should You Use?"
seoTitle: "Easypanel vs Dokploy (2026): Free Plan Limits, Backups and How to Switch"
description: "Easypanel vs Dokploy compared: Easypanel's free plan stops at 3 projects and puts backups on paid plans, while Dokploy is open source and free with no project limit. What each does, and how to move your apps from Easypanel to Dokploy."
date: "2026-11-23"
keywords: "easypanel, easypanel vs dokploy, dokploy vs easypanel, easypanel alternative, easypanel free plan, easypanel pricing, easypanel open source, move from easypanel to dokploy, self hosted paas, dokploy"
---

If you're comparing Easypanel vs Dokploy, here's the short answer. They do almost the same job: a dashboard on your own VPS where you deploy apps from Git, Docker images or Docker Compose, add databases, and get domains with HTTPS. Both run on Docker Swarm with Traefik in front. The difference is the business model. **Easypanel** is a polished panel with a free plan that stops at 3 projects, and things like scheduled database backups are on paid plans priced per server. **Dokploy** is open source and free to self-host, with no project limit, and backups are included.

I use Dokploy. Below is how the two compare, when Easypanel is still the better pick, and how to move your apps over step by step. At the end I show the easier way, where I asked Claude to check what's on my Dokploy and which of my databases are really backed up.

## Easypanel vs Dokploy at a glance

| | Easypanel | Dokploy |
|---|---|---|
| License | Not presented as open source | Apache 2.0 core, a few paid enterprise parts |
| Price to self-host | Free plan, paid plans per server per month | Free |
| Projects on the free version | Up to 3 | No limit |
| Under the hood | Docker Swarm, Traefik | Docker Swarm, Traefik |
| Deploy from | Git, Docker image, Docker Compose | Git (GitHub, GitLab, Bitbucket, Gitea, any Git URL), Docker image, Docker Compose |
| Builders | Dockerfile, Buildpacks, Nixpacks, Railpack | Dockerfile, Nixpacks, Railpack, Heroku and Paketo buildpacks, static |
| Databases | Postgres, MySQL, MariaDB, MongoDB, Redis | Postgres, MySQL, MariaDB, MongoDB, Redis, libSQL |
| Scheduled database backups to S3 | Paid plans | Free |
| One-click templates | 750+ (Easypanel's own count) | 602 on my Dokploy |
| Several servers | Cluster support in alpha, on the top paid plan | Remote servers and Swarm clusters |
| Install needs | Ubuntu, 2 GB RAM, ports 80 and 443 | Ubuntu, Debian, Fedora or CentOS, 2 GB RAM, 30 GB disk, ports 80, 443 and 3000 |

Easypanel's numbers come from its own pricing page and docs (November 2026). The free plan includes unlimited services and deployments, but only 3 projects. The paid plans add unlimited projects, database backups and notifications (Hobby), multiple users (Growth), and cluster support (Business).

## Is Easypanel free?

Yes, with limits. The free plan is free forever, but it allows up to 3 projects, and scheduled database backups, notifications and extra users are on paid plans. Paid plans are priced **per server**, so if you run two VPSes, you pay twice.

Dokploy has no such limits when you host it yourself. Its core is Apache 2.0. A few enterprise features, like SSO and custom branding, sit under a separate paid license, and you won't need them to deploy apps and back them up.

## When Easypanel is still the better pick

- **You love its UI and fit in 3 projects.** Easypanel is very polished, and for a couple of side projects the free plan is enough.
- **You want the biggest template catalog.** Easypanel says it has more than 750. Dokploy has 602, which covers the usual apps (n8n, Supabase, Nextcloud, Ghost, WordPress, Plausible, Umami, Uptime Kuma, Vaultwarden, Immich, MinIO, Appwrite and many more), but if your app is only in Easypanel's list, that matters.
- **You're happy to pay for support.** Easypanel's paid plans come with it.

## When Dokploy is the better pick

- **You have more than 3 projects.** I have 12 on one server. On Easypanel's free plan I couldn't create the fourth.
- **You want backups without a subscription.** Dokploy backs up Postgres, MySQL, MariaDB, MongoDB and Docker volumes to any S3 bucket on a schedule, for free.
- **You care about open source.** You can read Dokploy's code, run it forever, and nobody can put your projects behind a license check.
- **You'll grow past one server.** Dokploy can deploy to remote servers and join servers into a Swarm cluster.

## Can I run Easypanel and Dokploy on the same server?

No. Both want ports 80 and 443 for their Traefik, and both set up Docker Swarm on the machine. Use a fresh VPS for Dokploy, move one app at a time, and switch each app's DNS record when it's ready.

## How to move from Easypanel to Dokploy

### What you need

- **A new VPS** with at least 2 GB of RAM and 30 GB of disk. Hetzner, DigitalOcean, Hostinger and others all work.
- **Ports 80, 443 and 3000 free** on it.
- **SSH access to your Easypanel server**, to dump your databases.

### Step 1: Install Dokploy

SSH into the new server and run:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://your-server-ip:3000` and create your admin account.

### Step 2: Write down what Easypanel runs

For each service in Easypanel, note:

1. Where it comes from: a Git repo and branch, a Docker image, or a Compose file.
2. Its environment variables.
3. Its domains and the port the app listens on.
4. Any volumes with data you need to keep.

### Step 3: Create the databases in Dokploy

1. Create a project.
2. Click **Create Service**, then **Database**, and pick the same engine (PostgreSQL, MySQL, MariaDB, MongoDB or Redis).
3. Set a name, database name, user and password. Pick a version at least as new as the one Easypanel runs, so the restore works.
4. Click **Deploy**.

The database page shows an **Internal Connection URL**. Your apps use that, and it never leaves the server.

### Step 4: Move the data

Easypanel runs each database as a Docker container, so you can dump it on the old server. For Postgres:

```bash
docker ps --format '{{.Names}}' | grep your-db-service
docker exec CONTAINER pg_dump -U your_user -Fc your_db > app.dump
scp app.dump root@new-server-ip:/root/
```

Then on the Dokploy server, restore into the new database (its container name starts with the **App Name** shown on the database's page):

```bash
docker ps --format '{{.Names}}' | grep your-dokploy-db-app-name
docker cp /root/app.dump CONTAINER:/tmp/app.dump
docker exec -it CONTAINER pg_restore -U your_user -d your_db --no-owner --no-acl /tmp/app.dump
```

Stop the app on Easypanel first if it writes all day, so the dump is the last word.

### Step 5: Deploy each app

1. In the project, click **Create Service** and pick what you had:
   - **Application** for a Git repo or a Docker image. In **Provider**, pick GitHub (connect it once in Dokploy's Git settings) or another Git source, then the repo and branch. In **Build Type**, pick **Dockerfile** if the repo has one, otherwise **Nixpacks** (the default) or **Railpack**.
   - **Compose** for a Docker Compose file. Choose **Raw** to paste it, or point it at a Git repo.
   - **Template** if you deployed the app from Easypanel's templates. Search Dokploy's list first.
2. Paste the variables into the **Environment** tab. Replace the old database URL with the Internal Connection URL from Step 3.
3. Click **Deploy** and watch the logs. Turn on **Autodeploy** if you want every push to redeploy, like Easypanel's auto-deploy.

### Step 6: Add the domain with HTTPS

1. Open the service's **Domains** tab and click **Add Domain**.
2. Type the host, like `app.yourdomain.com`, and the **container port** the app listens on. For a Compose service, also pick the service name.
3. Turn on **HTTPS** and choose **Let's Encrypt**.
4. At your DNS provider, point the host's A record at the new server's IP. On Cloudflare, keep it **DNS only** (grey cloud) until the certificate is issued.

### Step 7: Set up backups (free this time)

1. Add your S3 bucket (AWS, Cloudflare R2, Backblaze B2 and others work) in Dokploy's settings under **S3 Destinations**.
2. Open each database's **Backups** tab, pick that destination, set a schedule and how many backups to keep.
3. Add a notification channel (Slack, Discord, Telegram or email) in Dokploy's settings so a failed backup reaches you.

When everything answers on the new server, keep the Easypanel server a few days before you delete it.

## The easier way: just ask Claude

Everything above means learning where Dokploy keeps things. You can skip most of that by connecting Dokploy to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

On Easypanel's free plan, scheduled backups were the thing I'd have been missing. So the first thing I'd want to know after moving is whether my databases are really backed up now. I asked:

> I'm moving from Easypanel. Show me what's on my Dokploy, which databases are actually backed up, and how many templates there are. Don't change anything.

Here's what happened:

1. Claude searched Zeqqat for "list projects" and listed every project with its services. **12 projects, 18 services**: 6 apps, 6 Compose stacks and 6 Postgres databases. On Easypanel's free plan, I'd have hit the limit at project 3.
2. It looked for backups. There's no single "list every backup" call in Dokploy's API, so it listed my S3 destinations (one bucket), then opened each database and read its backup schedules and recent runs. All read only.
3. It counted the templates: **602**.

The backup part is the one that mattered:

```
Nightly backup at midnight, keep 7, all runs OK     4 databases
Nightly backup, every run in its history failed     1 database
No backup schedule at all                            1 database
Dokploy itself (its own settings database)           backed up nightly, keep 3
```

The failing one belongs to an app I stopped a while ago. The database is idle, so there's nothing for the backup to dump, and the schedule kept running and failing every night anyway. Claude also noticed that Dokploy marks those runs as "error" but leaves the error message empty, so the reason is only in the run's log file.

The one with no schedule at all was the worst surprise: it's the database behind my main production app. I'd set up backups for everything else and missed the one that matters most. I hadn't spotted it in the dashboard, because you only see a database's backups when you open that database.

Claude also looked up what a new backup schedule takes: the database type and name, the S3 destination, a cron schedule, a file prefix and how many to keep. So "back that database up every night to my bucket and keep 7" is one sentence.

My Zeqqat connection allows reading, creating and editing, but delete is switched off, so Claude can set things up and can't remove anything. Database passwords and bucket keys came back as `{{zq_secret_...}}` handles, never the real values. And every call carried the same one-line reason, so the activity log shows the whole check as one request.

## What I took from it

Easypanel is a good panel, and if you have a couple of projects and like its UI, the free plan works. But once you have more than 3 projects, or you want backups without paying per server, Dokploy gives you the same kind of dashboard for free, and it's open source. Moving is an afternoon: new VPS, databases first, then apps, domains and backups. And you don't have to learn Dokploy first if you'd rather ask your AI to do it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Is Easypanel open source?

Easypanel's website doesn't describe it as open source, and I couldn't find its source code published anywhere. It's a commercial product with a free plan. If you want an open source panel that works the same way, Dokploy's core is Apache 2.0, and Coolify is too.

### Is Dokploy better than Easypanel?

They're close in features: both deploy from Git, Docker images and Compose files, run databases, and give you HTTPS domains through Traefik. Dokploy is free with no project limit and includes scheduled backups to S3. Easypanel has a more polished UI and a bigger template list, but its free plan stops at 3 projects and backups are on paid plans.

### How many projects can I have on Easypanel's free plan?

Up to 3 projects, with unlimited services and deployments inside them. For more projects, Easypanel's paid plans start with Hobby, priced per server per month. Self-hosted Dokploy has no project limit.
