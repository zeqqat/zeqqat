---
title: "A Portainer Alternative That Deploys From Git With SSL"
seoTitle: "Portainer Alternative (2026): Deploy From Git With Automatic SSL Using Dokploy"
description: "Looking for a Portainer alternative that deploys your Docker Compose stacks from Git and gets SSL certificates for you? Here's how to move to Dokploy, step by step."
date: "2026-11-19"
keywords: "portainer alternative, portainer alternatives, portainer alternative open source, portainer ce alternative, portainer 3.0, portainer git deploy ssl, dokploy, docker compose from git, lets encrypt docker compose"
---

If you want a Portainer alternative that deploys your stacks straight from Git and gets the SSL certificates for you, the one I use is **Dokploy**. Portainer is great at showing you what Docker is doing. But to put an app on a real domain with HTTPS, you still run a second tool next to it (Traefik, Nginx Proxy Manager or Caddy) and wire every container into it by hand. Dokploy does both jobs in one dashboard: pick a Git repo or paste a Compose file, type a domain, tick HTTPS, deploy. It's open source and free to self-host.

Below is why people are looking right now, what to pick, and how to move your stacks over step by step. At the end I show the easier way, where I asked Claude to check my Dokploy for me.

## Why people are looking for a Portainer alternative

Two reasons come up again and again.

**The second tool for SSL.** Portainer manages containers. It doesn't route domains to them or get Let's Encrypt certificates for them. So a typical Portainer setup is Portainer plus a reverse proxy, plus labels or proxy hosts for every app, plus remembering which is which.

**Portainer 3.0.** In September 2026, Portainer announced that version 3.0 puts Kubernetes first. Docker, Swarm and Podman are still supported, but the new GitOps and policy work goes to Kubernetes. Community Edition stays on the 2.x line: 2.45 LTS is the last 2.x release, and Portainer says it keeps getting security fixes and bug fixes. To use 3.x for free you need the Business Edition license, which is free for up to 3 nodes. Nothing breaks today, but if you run plain Docker on a VPS, it's fair to ask where you'll be in a year.

## Portainer alternatives at a glance

| | What it is | Deploys from Git | Domains and SSL built in |
|---|---|---|---|
| **Portainer CE** | Container manager: see and run containers, stacks, volumes | Yes, stacks from a Git repo | No, you add a reverse proxy |
| **Dokploy** | Self-hosted platform: apps, Compose stacks, databases, templates | Yes (GitHub, GitLab, Bitbucket, Gitea, any Git URL) | Yes (Traefik, Let's Encrypt) |
| **Coolify** | Self-hosted platform, same idea as Dokploy | Yes | Yes |

If you like Portainer and just want a fresh container manager, Komodo and Arcane are the two names I see most. If what you want is **"push to Git, my app is live on HTTPS"**, you want a platform, and that's Dokploy or Coolify. I compared those two in [Coolify vs Dokploy](/blog/coolify-vs-dokploy). The rest of this post is Dokploy.

## What you need

- **A VPS.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk. Ubuntu or Debian. Hetzner, DigitalOcean, Hostinger and others all work.
- **Ports 80, 443 and 3000 free.** Dokploy runs its own Traefik on 80 and 443. If your Portainer box already has Nginx Proxy Manager or Traefik on those ports, the two will fight. A fresh server is the easiest path, and you can move one stack at a time.
- **A domain** you can add DNS records to.

## Step 1: Install Dokploy

SSH into the server and run:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://your-server-ip:3000` and create your admin account.

## Step 2: Write down each Portainer stack

In Portainer, open every stack and copy three things somewhere safe:

1. **The Compose file** (or the Git repo and path, if the stack already deploys from Git).
2. **The environment variables.**
3. **Which volumes hold data**, and which port each web service listens on inside the container.

## Step 3: Deploy a stack from Git in Dokploy

1. Create a project (call it anything).
2. Click **Create Service**, then **Compose**. Leave the type as **Docker Compose**. (**Stack** is the Swarm mode, only needed if you run several servers.)
3. In the **General** tab, pick the source:
   - **GitHub, GitLab, Bitbucket or Gitea** after connecting the provider in Dokploy's Git settings, or **Git** for any repo URL (add an SSH key for a private one). Choose the branch and the path to the Compose file, for example `docker-compose.yml`.
   - **Raw** if you'd rather paste the Compose file you copied from Portainer.
4. Paste the variables into the **Environment** tab.
5. Click **Deploy** and watch the logs.

To redeploy on every push, turn on **Autodeploy**. With the GitHub provider that's all it takes. For other Git hosts, copy the webhook URL from the service's **Deployments** tab into your repo's webhook settings. You can also tell Dokploy to deploy only on new tags, or only when certain paths change.

### Or use a template

Before writing anything, click **Create Service**, then **Template**, and search. My Dokploy lists 602 templates, including most things people run in Portainer: Nextcloud, Vaultwarden, Jellyfin, Immich, Home Assistant, Uptime Kuma, Gitea. There's even a Portainer template, if you want to keep it around for poking at containers.

## Step 4: Add the domain with SSL

This is the part that replaces your reverse proxy.

1. Open the Compose service's **Domains** tab and click **Add Domain**.
2. Type the host, like `cloud.yourdomain.com`.
3. Pick the **service name** from your Compose file and the **container port** it listens on (the port inside the container, not one you published on the host).
4. Turn on **HTTPS** and choose **Let's Encrypt** as the certificate.
5. At your DNS provider, add an A record for that host pointing to the server's IP. On Cloudflare, keep it **DNS only** (grey cloud) until the certificate is issued.
6. Redeploy.

No labels to write, no proxy host to click through, no certbot. You can drop the `ports:` lines for web services from your Compose file too, since Traefik reaches them over Dokploy's network. Keep host ports only for things that aren't HTTP, like Pi-hole's DNS on port 53.

## Step 5: Move the data

Your data lives in Docker volumes on the old server. For each one, stop the stack in Portainer, then pack the volume into a file:

```bash
docker run --rm -v my_volume:/data -v "$PWD":/backup alpine \
  tar czf /backup/my_volume.tar.gz -C /data .
```

Copy the file to the new server with `scp`, deploy the stack once in Dokploy so its volume exists, stop it, and unpack into the new volume the same way (`tar xzf` instead of `tar czf`). Dokploy prefixes Compose volume names with the service's app name, so run `docker volume ls` on the new server to find the right one. Start the stack again.

For a database inside a stack, a dump is safer than copying files: `pg_dump` or `mysqldump` on the old side, restore on the new side.

Once everything answers on its domain, switch off the old stacks. Keep the Portainer server for a few days before you delete anything.

## The easier way: just ask Claude

Everything above means learning where Dokploy keeps things. You can skip most of that by connecting Dokploy to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

Before moving anything, I wanted to know how much of a typical Portainer setup I'd have to write by hand. So I asked:

> I'm moving off Portainer. My stacks are Nextcloud, Vaultwarden, Jellyfin, Immich, Home Assistant, Uptime Kuma and Pi-hole. Check which ones have a template in my Dokploy. Don't create anything.

Here's what happened:

1. Claude searched Zeqqat for "templates" and found Dokploy's template tools: list them, preview one, deploy one. It picked the list, which is read only.
2. It ran it. Dokploy returned 602 templates.
3. It picked out the ones I asked about:

```
Nextcloud        33.0.6
Vaultwarden      1.36.0
Jellyfin         v10.9.7
Immich           v3.0.2
Home Assistant   stable
Uptime Kuma      2.5.8
Pi-hole          no template
```

Six of seven are one click. Pi-hole is the one I'd bring over as a Compose file, pasted into a **Raw** Compose service, with port 53 published on the host.

Before writing anything, Claude also looked up what adding a domain takes. Dokploy's domain tool takes the host, the Compose service name, the container port, HTTPS on, and the certificate type (`letsencrypt`, `none` or `custom`). That's Step 4 above in one call, so "put Vaultwarden on vault.mydomain.com with HTTPS" is a sentence, not a checklist.

My Zeqqat connection allows reading, creating and editing, but delete is switched off, so Claude can set things up and can't remove anything. Secrets a template generates come back as `{{zq_secret_...}}` handles, never the real values. And every call carried the same one-line reason, so the activity log shows the whole check as one request.

## What I took from it

If Portainer was your window into Docker, the thing you actually want next is probably fewer moving parts: Git in, HTTPS out, one dashboard. That's Dokploy. Moving is an afternoon per few stacks: recreate each one from Git or a template, add the domain, copy the volumes. And you don't have to learn Dokploy first if you'd rather ask your AI to do it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### What is the best open source alternative to Portainer?

It depends on what you used Portainer for. To keep managing containers by hand, look at Komodo or Arcane. To deploy stacks from Git with domains and SSL handled for you, Dokploy (Apache 2.0 core) or Coolify are the closest, because they include the reverse proxy and Let's Encrypt.

### Is Portainer Community Edition still supported?

Yes. Portainer said in September 2026 that Community Edition stays on the 2.x line, with 2.45 LTS as the last 2.x release, and keeps getting security and bug fixes. New 3.x features go to the Business Edition, which is free for up to 3 nodes.

### Can Dokploy deploy a Docker Compose file from Git with HTTPS?

Yes. Create a Compose service, point it at your repo, branch and Compose file path, then add a domain in the Domains tab with HTTPS on and Let's Encrypt as the certificate. Turn on Autodeploy to redeploy on every push.
