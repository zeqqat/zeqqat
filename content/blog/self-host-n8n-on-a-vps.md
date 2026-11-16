---
title: "How to Self-Host n8n on a VPS with Docker Compose (the Cheap Way)"
seoTitle: "Self Host n8n on a VPS with Docker Compose: Dokploy Template, HTTPS and Backups"
description: "How to self host n8n on a VPS with Docker Compose: install Dokploy, deploy the n8n template, add HTTPS and webhooks, and back up the one key you can't lose."
date: "2026-11-16"
keywords: "self host n8n, self host n8n docker compose, self host n8n on a vps, n8n vps, n8n docker compose, cheapest way to host n8n, n8n dokploy, n8n webhook url, n8n encryption key"
---

If you want to self host n8n on a VPS with Docker Compose, here's the short answer: rent a small Linux server, install Dokploy on it, and deploy n8n from Dokploy's template. You get n8n on your own domain with HTTPS, and a monthly bill that's just the server. It's also the cheapest way to host n8n I know, because one small VPS can run n8n and everything else you self-host next to it.

I'll go step by step, for someone who has never self-hosted anything. Then I'll show the easier way, where I asked Claude to check the setup for me.

## What you need

- **A VPS.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk. That's enough for Dokploy plus a basic n8n. If you plan to run the Postgres or queue-mode version, I'd pick 4 GB. Hetzner, DigitalOcean, Hostinger and others all work. Choose Ubuntu or Debian.
- **A domain** you can add a DNS record to. n8n needs HTTPS for logins and webhooks to work properly, and HTTPS needs a domain.

That's it. No n8n license: the self-hosted version is free to run.

## Step 1: Install Dokploy

SSH into your server and run Dokploy's install script:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Ports 80, 443 and 3000 must be free first, or the install fails. When it finishes, open `http://your-server-ip:3000` and create your admin account.

## Step 2: Pick the right n8n template

Dokploy has a gallery of one-click templates. My Dokploy lists 602 of them, and four are n8n:

| Template | What it is | Listed version |
| --- | --- | --- |
| **n8n** | n8n on its own. The smallest and cheapest. | 1.104.0 |
| **n8n with Postgres** | n8n plus a PostgreSQL database. | latest |
| **n8n Queue Mode** | Main instance plus workers, with Redis and PostgreSQL. For heavy workloads. | 2.30.4 |
| **n8n + Worker + Runner with Redis/Postgres and Ollama** | The queue setup plus a local AI model. Needs a big server. | latest |

If you're starting out, pick **n8n** or **n8n with Postgres**. Queue mode is for when one n8n can't keep up, and you'll know when that happens.

One thing to notice: the plain **n8n** template is listed at 1.104.0 while Queue Mode is at 2.30.4. After you create the service, open its Compose file and look at the image tag. If you want the newest n8n, change the tag before you deploy.

## Step 3: Deploy the n8n template in Dokploy

1. Create a project (call it anything, like "automation").
2. Inside it, click **Create Service**, choose **Template**, search for **n8n** and create the one you picked.

Dokploy creates a Docker Compose service, fills in the environment, and gives it a free generated domain. Don't deploy yet.

## Step 4: Add your domain with HTTPS

The generated domain is HTTP only. n8n sets a secure login cookie by default, so over plain HTTP you'll hit a cookie warning instead of the login page. Use your own domain:

1. At your DNS provider, add an **A record** (for example `n8n.yourdomain.com`) pointing to your server's IP. If you use Cloudflare, set it to DNS only (grey cloud) so Let's Encrypt can reach your server.
2. In Dokploy, open the service's **Domains** tab and edit the domain: host `n8n.yourdomain.com`, service `n8n`, port `5678` (n8n's port), turn on **HTTPS**, and pick **Let's Encrypt**.

## Step 5: Check the environment (webhooks and your encryption key)

Open the **Environment** tab and make sure n8n knows its own address. These are n8n's own settings:

- **`N8N_HOST`** should be your domain, `n8n.yourdomain.com`.
- **`WEBHOOK_URL`** should be `https://n8n.yourdomain.com/`. Behind a proxy, n8n uses this to build the webhook URLs it shows you. If it's wrong, Stripe, GitHub or Telegram get a URL that goes nowhere.
- **`GENERIC_TIMEZONE`** should be your timezone, like `Africa/Nairobi`, so scheduled workflows run when you expect.
- **`N8N_ENCRYPTION_KEY`** is the key n8n encrypts your saved credentials with. If it isn't set, n8n makes one on first start and saves it inside its data volume. Either way, copy it somewhere safe. Lose it and every saved credential becomes unreadable.

If a variable isn't in the template's environment, add it here and reference it in the Compose file. Then click **Deploy**. When it's up, open `https://n8n.yourdomain.com` and create your owner account.

For Docker Compose services, Dokploy reads domains from Docker labels, so if you change the domain later you have to redeploy.

## Step 6: Back it up

Your workflows, credentials and execution history live in a Docker volume (and in Postgres, if you picked that template). Dokploy can back up a Docker volume on a schedule to any S3-compatible storage, and back up its databases the same way. Set up a destination once, then schedule the backups on the service. Do it on day one, not after something breaks.

## No template? The Docker Compose route

The template is the fastest path, but you can also paste your own Compose file. In Dokploy, choose **Create Service**, then **Compose**, and paste something like this:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    restart: unless-stopped
    expose:
      - 5678
    environment:
      - N8N_HOST=${N8N_HOST}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://${N8N_HOST}/
      - GENERIC_TIMEZONE=${GENERIC_TIMEZONE}
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

Put `N8N_HOST`, `GENERIC_TIMEZONE` and `N8N_ENCRYPTION_KEY` in the Environment tab, add the domain on port 5678 like in Step 4, and deploy. Notice there's no `ports:` line. Traefik, which Dokploy runs for you, sends traffic from your domain to the container, so nothing needs to be published to the internet directly. Pin the image to a version (`docker.n8n.io/n8nio/n8n:<version>`) once it works, so an update never surprises you.

## The easier way: just ask Claude

Everything above is clicking through Dokploy. You can skip learning Dokploy entirely by connecting it to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, then paste Zeqqat's MCP URL into Claude as a connector. After that you say what you want.

Here's what I asked:

> Which n8n templates does my Dokploy have? Then check what my own n8n Compose file would create, without creating anything.

Here's what happened, call by call:

1. Claude searched Zeqqat for "template" and found Dokploy's template tools: list templates, preview a template, deploy a template.
2. It listed the templates. That's where the table in Step 2 came from, including the version gap between the plain n8n template and Queue Mode.
3. It packed the Compose file above into a template and ran Dokploy's preview, which is read only. Dokploy worked out what it would create without saving anything:

```
domains: n8n, port 5678, <generated>.sslip.io
envs:
  N8N_HOST=<generated>.sslip.io
  GENERIC_TIMEZONE=Europe/Berlin
  N8N_ENCRYPTION_KEY={{zq_secret_syvajyg7q2ggy9ns}}
```

The encryption key was generated by Dokploy and never reached Claude: Zeqqat swapped it for a `{{zq_secret_...}}` handle before the answer came back. That matters here more than anywhere, because that key unlocks every credential in your n8n. Claude can still pass the handle back to Dokploy when it deploys, without ever seeing the value.

It also caught the HTTPS problem from Step 4 before anything was running: the preview's domain is a generated HTTP address, while the Compose file tells n8n it's on HTTPS. Webhook URLs would point at a protocol the domain doesn't serve.

I stopped there. Deploying is one more call, and my Zeqqat connection allows it because it creates something new. Delete is switched off on that connection, so Claude can set things up but can't remove anything. Every call carried the same one-line reason, so in Zeqqat's activity log the whole thing shows up as one request I can read back.

## What I took from it

Self-hosting n8n on a VPS is a template and four settings in Dokploy: your domain with HTTPS, the right webhook URL, your timezone, and an encryption key you've saved somewhere. Add a backup and you have the cheapest serious n8n setup there is. And if you'd rather not learn where all of those live, you can ask your AI to check them for you.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### What is the cheapest way to host n8n?

Self-host it on a small VPS. n8n's self-hosted version is free to run, so you only pay for the server. Dokploy needs at least 2 GB of RAM and 30 GB of disk, which is enough for Dokploy and a basic n8n, and the same server can host your other apps too.

### Why do my n8n webhook URLs show localhost?

n8n builds webhook URLs from its own settings, and behind a reverse proxy it doesn't know your public address unless you tell it. Set `WEBHOOK_URL` to `https://your-domain/` (and `N8N_HOST` to your domain), then redeploy.

### What happens if I lose the n8n encryption key?

n8n encrypts every saved credential with `N8N_ENCRYPTION_KEY`. If you move or restore n8n without the same key, it can't decrypt them and you have to enter every credential again. Set the key yourself, keep a copy, and back up n8n's data volume.
