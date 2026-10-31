---
title: "Coolify vs Dokploy in 2026: Which Self-Hosted PaaS Should You Use?"
seoTitle: "Coolify vs Dokploy (2026): Honest Comparison for Self-Hosters"
description: "Coolify vs Dokploy compared on multi-server, backups, templates, API access, licensing and AI/MCP support. Which self-hosted PaaS fits your VPS in 2026."
date: "2026-10-31"
keywords: "coolify vs dokploy, dokploy vs coolify, coolify, dokploy, self-hosted paas"
---

If you want Heroku-style deploys on your own VPS, the two names that keep coming up are **Coolify** and **Dokploy**. Both are open source, both run on Docker, and both give you a dashboard where you connect a Git repo, add a domain and press deploy.

They are closer than most comparisons make them sound. The real differences are in a few specific places: how they handle more than one server, how backups and restores work, how big the template catalog is, and how much control you get over API access. This post goes through each one.

## The short answer

- **Pick Coolify** if you want the biggest catalog of one-click apps, the larger community, and finer-grained API tokens.
- **Pick Dokploy** if you plan to run several servers as one cluster, want database restores in the UI, or prefer Traefik and Docker Swarm under the hood.
- **Either works** for the most common case: one VPS, a handful of apps, a couple of databases.

## What they have in common

Before the differences, it helps to know how much overlaps:

- Self-hosted and open source, installed with a single script on a fresh Linux server.
- Deploy from GitHub, GitLab and other Git providers, or from a Dockerfile or Docker Compose file.
- Automatic HTTPS with Let's Encrypt.
- Managed databases (Postgres, MySQL, MongoDB, Redis and more) with scheduled backups to S3-compatible storage.
- Resource monitoring and live logs in the dashboard.
- A REST API, so you can script everything you can click.
- A paid cloud version if you don't want to host the dashboard yourself.

## Side by side

| | Coolify | Dokploy |
|---|---|---|
| License | Apache 2.0 | Mostly Apache 2.0, some parts proprietary |
| Default proxy | Traefik (Caddy optional) | Traefik |
| Multiple servers | Deploy to many servers; spreading one app across them is manual | Docker Swarm clusters plus remote servers |
| One-click templates | 280+ | Smaller catalog |
| Database restores | Backups to S3; restores mostly manual | Restores from the UI, volume backups to S3 |
| API access control | Token permissions: read, read:sensitive, write, deploy, root | Keys inherit the creating user's permissions |
| Built-in MCP server | Yes, read-only | Official MCP package (separate install) |

## Multi-server: the biggest real difference

This is where the two projects took different paths.

**Dokploy** builds on Docker Swarm. You can join several servers into a cluster, and Traefik routes traffic to containers wherever they run. You can also add remote servers and choose where each app deploys. If you expect to outgrow one machine, this is the strongest argument for Dokploy.

**Coolify** can connect many servers and deploy different apps to different machines. What it doesn't do out of the box is run one app across several servers with load balancing; you set that up yourself with your own load balancer. Multi-server scaling is the main focus of Coolify v5, which is in development and not released as of this writing.

If you run one VPS, this difference doesn't matter yet.

## Templates and ecosystem

Coolify has the bigger catalog by a wide margin, with more than 280 one-click services. It also has the larger community, which means more tutorials, more answered questions and more people who have hit your exact error before. In Google Trends over the past year, searches for Coolify ran at roughly two and a half times the volume of searches for Dokploy.

Dokploy's template list covers the popular apps (Supabase, Cal.com, PocketBase and others) but is smaller. For anything missing, both tools let you paste a Docker Compose file, so a missing template is an inconvenience rather than a blocker.

## Backups and restores

Both schedule database backups to any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO).

The difference is getting data back. Dokploy lets you restore a database backup from the dashboard and can back up Docker volumes to S3. With Coolify, as of early 2026, restoring usually meant connecting over SSH and running the restore command yourself, and volume backups to S3 weren't built in.

Whichever you choose, test a restore before you need one. A backup you have never restored is a guess.

## API access and permissions

This matters more than it used to, because the API is now how AI agents and scripts talk to your server.

**Coolify** gives each API token its own permission level:

- `read` lists and inspects resources with sensitive values redacted.
- `read:sensitive` adds secrets, environment values, logs and Compose content.
- `write` creates, updates and deletes.
- `deploy` triggers deploys, restarts and stops, and nothing else.
- `root` does everything within its team.

Tokens can expire after a set period, and self-hosted instances can restrict API calls to an IP allowlist. A deploy-only token for CI is a one-click choice.

**Dokploy** API keys inherit the permissions of the user who created them and are tied to one organization. To give a script less power, you create a user with fewer permissions (a member restricted to certain projects, for example) and create the key as that user. Fine-grained custom roles exist but are an enterprise feature.

If you care about handing out narrow, short-lived credentials, Coolify is ahead here today.

## AI agents and MCP

Both projects now speak MCP (Model Context Protocol), the standard that lets agents like Claude, Cursor and ChatGPT call tools on your server.

- **Coolify** added a built-in MCP server in 2026. It is read-only by design: about ten tools for listing and inspecting servers, projects, apps, databases and services. For deploys and changes, people use community MCP servers that need a token with write access.
- **Dokploy** has an official MCP package that turns its whole API into tools, more than 500 of them. It redacts secrets from responses by default, and you can load only a subset of tools. It authenticates with a single Dokploy API key.

The pattern in both cases: read-only is easy, but the moment you want an agent to deploy or change things, it holds a key that can do much more than the task in front of it. That's worth thinking about before you paste a key into an agent config. We wrote about it in [Is it safe to give an AI agent your Dokploy API key?](/blog/ai-agent-dokploy-api-key)

## Which one should you choose?

- **One VPS, a few side projects:** either. Try the dashboard of each for an afternoon and keep the one that feels right.
- **Many self-hosted apps from templates (n8n, Plausible, Uptime Kuma and friends):** Coolify, for the catalog.
- **Planning to grow past one server:** Dokploy, for Swarm clustering.
- **Production databases you can't afford to lose:** Dokploy's UI restores are a real advantage, but test restores either way.
- **Strict API access for CI or agents:** Coolify's token permissions are finer out of the box.

Switching later isn't free but isn't terrible either. Both run plain Docker containers, so moving an app is mostly a matter of recreating it, copying environment variables and restoring the database.

## FAQ

### Is Dokploy better than Coolify?

Neither is better overall. Dokploy is stronger for multi-server clusters and database restores. Coolify is stronger for one-click templates, community size and API token permissions.

### Is Coolify or Dokploy free?

Both are free to self-host. Both also sell a managed cloud version that hosts the dashboard for you while your apps still run on your own servers.

### Can I run Coolify and Dokploy on the same server?

Not comfortably. Both want to own ports 80 and 443 through their own proxy. Use separate servers if you want to try both.

### Do Coolify and Dokploy support Docker Compose?

Yes. Both deploy Docker Compose files directly, which is also the fallback when a one-click template doesn't exist.

### Which is better for AI agents?

Coolify offers a built-in read-only MCP server and finer API token permissions. Dokploy's official MCP package covers its entire API. In both, write access means trusting the agent with a powerful key, so limit what that key can do.
