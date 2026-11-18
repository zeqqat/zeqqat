---
title: "Coolify Alternatives in 2026: 5 Self-Hosted Options, and How to Switch"
seoTitle: "Coolify Alternatives (2026): Dokploy, CapRover, Dokku, Kamal, Easypanel"
description: "The best Coolify alternatives you can self-host in 2026: Dokploy, CapRover, Dokku, Kamal and Easypanel compared, plus how to move your apps off Coolify to Dokploy step by step."
date: "2026-11-18"
keywords: "coolify alternatives, coolify alternative, coolify alternative self hosted, dokploy, caprover, dokku, kamal, easypanel, self hosted paas, move from coolify to dokploy"
---

If you're looking for Coolify alternatives, here's the short answer: **Dokploy** is the closest one. It does what Coolify does (a dashboard on your own VPS where you deploy from Git, Docker Compose or a one-click template, with HTTPS and database backups), it's open source, and it runs apps across several servers with Docker Swarm. If you want something smaller, **CapRover** is a simpler web UI, **Dokku** is Heroku-style `git push` with no dashboard, **Kamal** deploys from your laptop over SSH, and **Easypanel** is a polished panel that isn't open source.

Below I compare the five, then show how to move an app from Coolify to Dokploy, step by step. At the end I show the easier way, where I asked Claude to check my Dokploy for me.

## Why people look for a Coolify alternative

Coolify is good. It's Apache 2.0, has a big community, and about 360 one-click templates. People still leave it, and the reasons I see most are:

- **More than one server.** Coolify can deploy to many servers, but running one app across them is up to you. Coolify v5 is meant to fix that, and as of November 2026 its GitHub milestone is still open with no due date.
- **A different feel.** Some people want less (just `git push`), some want a different dashboard.
- **Something broke** after an update, and they want to know what else is out there.

## Coolify alternatives at a glance

| | License | How you deploy | Dashboard | Proxy | Several servers |
|---|---|---|---|---|---|
| **Dokploy** | Apache 2.0 core, some paid enterprise parts | Web UI: Git, Dockerfile, Docker Compose, templates | Yes | Traefik | Docker Swarm, plus remote servers |
| **CapRover** | Apache 2.0 | CLI (`caprover deploy`), web UI, Git webhook | Yes | NGINX | Docker Swarm |
| **Dokku** | MIT | `git push`, archives, images | Only with paid Dokku Pro | NGINX | Optional K3s scheduler |
| **Kamal** | MIT | CLI on your laptop, over SSH | No | kamal-proxy | Yes, with your own load balancer |
| **Easypanel** | Not presented as open source | Web UI: Git, Docker, templates | Yes | Built in | Cluster support in alpha, on the top paid plan |

## 1. Dokploy: the closest match

Dokploy is what I use, and it's the one that feels most like Coolify. You get projects, apps, databases (Postgres, MySQL, MariaDB, MongoDB, Redis), domains with Let's Encrypt, scheduled backups to S3, and one-click templates.

Two things surprised me. First, the template gallery is bigger than people think. Dokploy doesn't publish a number, so I counted: my Dokploy lists **602 templates**. Second, Dokploy can restore a database backup from the dashboard, where on Coolify that has usually meant SSH.

On licensing: everything outside folders named `proprietary/` is Apache 2.0, and Dokploy has said it won't move existing open source features into the paid license. The paid parts are enterprise things like SSO and custom branding. If you're one person with a VPS, you won't touch them.

I wrote a longer side by side in [Coolify vs Dokploy](/blog/coolify-vs-dokploy).

## 2. CapRover: simple and long-running

CapRover has been around for years. It has a web dashboard, one-click apps, NGINX in front, and Docker Swarm from day one. You deploy with its CLI or by connecting a Git webhook. Its weak spot is Docker Compose: Swarm uses its own format, so support for Compose files is limited. If your apps are single containers, it's a calm, stable choice.

## 3. Dokku: Heroku on your own server

Dokku is the oldest of the bunch (since 2013). You `git push dokku main` and it builds and runs your app, with NGINX in front and plugins for databases and Let's Encrypt. There's no dashboard in the free version. If you live in the terminal and liked Heroku, you'll feel at home. If you want to click, look elsewhere.

## 4. Kamal: deploy from your laptop

Kamal comes from 37signals (the people behind Basecamp). It isn't a server you install and log into. You run it on your machine, it reads a YAML file, and it ships containers to your servers over SSH, with kamal-proxy giving you zero-downtime deploys. No dashboard, no template catalog, no managed databases. It's great if you have one app and want full control. It's a lot to learn if you just want n8n running.

## 5. Easypanel: polished, but not open source

Easypanel has a clean UI and a large template catalog. Its free plan is free forever but limited to 3 projects, and things like database backups and multiple users are on paid plans, which are priced per server per month. Its site doesn't describe it as open source. If that matters to you, it's out.

## Which Coolify alternative should you pick?

- **You want Coolify, but different:** Dokploy.
- **You want to grow past one server:** Dokploy or CapRover (both Swarm).
- **You only `git push`:** Dokku.
- **You run one app and love the terminal:** Kamal.
- **You want a panel and don't mind closed source:** Easypanel.

## How to move from Coolify to Dokploy

Both run plain Docker containers, so there's no magic import. You recreate each app and move its data. Here's the whole thing.

### What you need

- **A VPS for Dokploy.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk. Ports 80, 443 and 3000 must be free, so use a fresh server rather than the one Coolify is on. Two tools that both want ports 80 and 443 won't share a box.
- **Your domains' DNS**, so you can point them at the new server at the end.

### Step 1: Install Dokploy

SSH into the new server and run:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://your-server-ip:3000` and create your admin account.

### Step 2: Write down what each Coolify app needs

For every app in Coolify, copy three things somewhere safe: where it comes from (Git repo and branch, Docker image, or Compose file), its environment variables, and its domain. Those are what you'll recreate.

### Step 3: Recreate each app in Dokploy

1. Create a project (call it anything).
2. Inside it, click **Create Service**.
   - For an app from **Git**, choose **Application**, connect your Git provider, pick the repo and branch, and choose the build type (Nixpacks, Railpack, Dockerfile, Heroku or Paketo buildpacks, or static). If Coolify built it with Nixpacks or a Dockerfile, pick the same.
   - For a **Docker Compose** app, choose **Compose** and paste the file.
   - For something you installed from a Coolify template (n8n, Plausible, Uptime Kuma), choose **Template** and search for it. Most popular ones exist on both.
3. Paste the environment variables into the **Environment** tab.
4. Don't add the real domain yet. Deploy and check the app starts on the generated test domain.

### Step 4: Move your databases

Create the same database type in Dokploy (**Create Service**, then **Database**). Then copy the data across: take a dump on the Coolify side (for Postgres, `pg_dump` inside the database container) and restore it into the new one. Update the app's connection string in its Environment tab to the new database's internal address, which Dokploy shows on the database page.

If Coolify was already sending backups to S3, you can also add the same bucket in Dokploy under **S3 Destinations** and restore from there in the database's **Backups** tab.

### Step 5: Switch the domain

When the app works on the test domain:

1. In the app's **Domains** tab, add your real domain, turn on **HTTPS** and pick **Let's Encrypt**.
2. At your DNS provider, point the domain's A record at the new server. If you use Cloudflare, keep it DNS only (grey cloud) until the certificate is issued.

Leave Coolify running for a few days. Once nothing points at it, turn it off.

## The easier way: just ask Claude

Everything above means learning where Dokploy keeps things. You can skip most of that by connecting Dokploy to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

Before moving anything, the first question when you leave Coolify is "will my apps be there?". So that's what I asked:

> I'm moving off Coolify. Check whether my Dokploy has templates for n8n, Plausible, Uptime Kuma, Umami, Ghost and Vaultwarden. Don't create anything.

Here's what happened:

1. Claude searched Zeqqat for "template" and found Dokploy's template tools: list the templates, preview one, deploy one. It picked the list, which is read only.
2. It ran it. Dokploy returned 602 templates.
3. It picked out the ones I asked about:

```
n8n           1.104.0   (also: n8n with Postgres, n8n Queue Mode)
Plausible     v3.2.1
Uptime Kuma   2.5.8
Umami         v3.4.1
Ghost         6.0.0
Vaultwarden   1.36.0
```

All six are there, so for those apps, moving is: deploy the template, copy the data, switch the domain. From here I could say "deploy the Umami template in a new project" and Claude would do it. My Zeqqat connection allows creating and editing, but delete is switched off, so it can set things up and can't remove anything. Any secrets a template generates come back as `{{zq_secret_...}}` handles, never the real values, and every call carried the same one-line reason, so the activity log shows it all as one request.

## What I took from it

The best Coolify alternative depends on how you like to work, but if you want the same kind of dashboard, Dokploy is the closest, and it has more templates than its reputation suggests. Moving is a weekend job: recreate the apps, copy the databases, switch DNS. And you don't have to learn Dokploy first if you'd rather ask your AI to do it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### What is the best open source alternative to Coolify?

Dokploy is the closest. It has the same kind of dashboard, deploys from Git, Docker Compose and one-click templates, and its core is Apache 2.0. CapRover (Apache 2.0) and Dokku (MIT) are also open source, and simpler.

### Is Dokploy free?

Yes, self-hosting Dokploy is free. Its core is Apache 2.0. A few enterprise features, like SSO and custom branding, live in separate folders under a paid license, and you don't need them to deploy apps.

### Can I migrate from Coolify to Dokploy?

Yes, but by hand. There's no import tool. Recreate each app in Dokploy from the same Git repo, Compose file or template, copy its environment variables, dump and restore its database, then point your domain at the new server.
