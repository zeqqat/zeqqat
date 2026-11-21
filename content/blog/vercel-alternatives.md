---
title: "Vercel Alternatives You Can Self-Host, and How to Move Your Next.js App"
seoTitle: "Vercel Alternatives (2026): Self-Host Next.js on a VPS with Dokploy, Open Source"
description: "The Vercel alternatives you can self-host in 2026, open source and free to run, and how to move a Next.js app off Vercel to your own VPS with Dokploy, including preview deployments."
date: "2026-11-21"
keywords: "vercel alternatives, vercel alternative, vercel alternative open source, vercel alternatives for nextjs, self host nextjs, vercel alternative self hosted, move off vercel, vercel to dokploy, nextjs vps, dokploy"
---

If you're looking for Vercel alternatives you can self-host, the one I use is **Dokploy**. It's open source and free to run. You connect a GitHub repo, it builds your Next.js app, gives it a domain with HTTPS, redeploys on every push, and can even spin up a preview for each pull request. The difference is that it runs on a VPS you rent yourself, so the bill is the server and nothing else.

Below is why people leave Vercel, the other options, and how to move a Next.js app to Dokploy step by step. At the end I show the easier way, where I asked Claude to work out the move for me.

## Why people look for Vercel alternatives

Vercel is very good at what it does. People leave for two reasons.

**The bill is per seat and per usage.** Vercel's Pro plan is $20 a month for one deploying seat, with $20 of usage credit included. Every extra person who deploys is another $20 a month. Past the credit you pay as you go: data transfer is $0.15 to $0.35 per GB depending on region, plus function time, memory and requests (Vercel's pricing pages, November 2026). The free Hobby plan has hard caps and you can't buy more usage on it. When you hit one, you wait for the 30 days to reset.

**Owning where it runs.** Some people just want their app and its data on a machine they control, next to their database, with no surprise on the invoice.

The good news for Next.js: you lose very little. The Next.js docs say a Node.js server or a Docker container "supports all Next.js features". Image optimization works with `next start` and no setup. Vercel isn't required for any of it.

## Vercel alternatives at a glance

| | Open source | Where it runs | Deploy from GitHub | Preview per pull request | Domains and HTTPS |
|---|---|---|---|---|---|
| **Dokploy** | Yes | Your VPS | Yes, plus GitLab, Bitbucket, Gitea, any Git URL | Yes (GitHub) | Yes (Traefik, Let's Encrypt) |
| **Coolify** | Yes | Your VPS | Yes | Yes | Yes |
| **CapRover** | Yes | Your VPS | Through a webhook or its CLI | No | Yes |
| **Netlify, Cloudflare** | No | Their cloud | Yes | Yes | Yes |

Netlify and Cloudflare are hosted platforms like Vercel, so you swap one bill for another. If you want a Vercel alternative that's open source and self-hosted, Dokploy and Coolify are the closest match. I compared them in [Coolify vs Dokploy](/blog/coolify-vs-dokploy). If you're also on Railway, there's a sister post on [Railway alternatives](/blog/railway-alternatives). The rest of this post is Dokploy.

## What you need

- **A VPS.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk. Ubuntu or Debian. Next.js builds are hungry, so 4 GB is more comfortable. Hetzner, DigitalOcean, Hostinger and others all work.
- **Ports 80, 443 and 3000 free.** Dokploy runs Traefik on 80 and 443 and its dashboard on 3000.
- **A domain** you can add DNS records to.

## Step 1: Install Dokploy

SSH into the server and run:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://your-server-ip:3000` and create your admin account.

## Step 2: Copy what's in Vercel

For your Vercel project, write down:

1. **The GitHub repo and branch** it deploys from.
2. **The environment variables.** In the project's **Settings**, then **Environment Variables**. Note which ones are for Production and which for Preview.
3. **Any cron jobs** in `vercel.json`. They won't move by themselves (more on that in Step 6).

Keep Vercel running until the very end. Nothing here touches it.

## Step 3: Deploy the Next.js app from GitHub

1. In Dokploy, create a project (call it anything).
2. Click **Create Service**, then **Application**.
3. In **Provider**, pick **GitHub** (connect your GitHub account once in Dokploy's Git settings), then the repo and branch. If the app lives in a folder of a monorepo, set **Build Path** to that folder.
4. In **Build Type**, leave **Nixpacks** (the default). It sees a Next.js app and runs your `build` and `start` scripts. **Railpack** works too. If your repo has a Dockerfile, pick **Dockerfile**.
5. Open the **Environment** tab and paste your Production variables.
6. Click **Deploy** and watch the logs.

One thing to watch while you paste: `NEXT_PUBLIC_` variables are baked in at build time, not read at runtime. Paste them before the first deploy, and redeploy after you change one.

Turn on **Autodeploy** and every push to that branch redeploys, like on Vercel.

## Step 4: Add the domain with HTTPS

1. Open the app's **Domains** tab and click **Add Domain**.
2. Type the host, like `app.yourdomain.com`, and the **container port**: `3000`, which is where `next start` listens.
3. Turn on **HTTPS** and choose **Let's Encrypt**.
4. At your DNS provider, point the host at the server's IP with an A record. If it was a CNAME to Vercel, replace it. On Cloudflare, keep it **DNS only** (grey cloud) until the certificate is issued.

## Step 5: Turn on preview deployments

This is the Vercel feature people miss most, and Dokploy has it for GitHub repos.

1. Add a wildcard DNS record, `*.yourdomain.com`, pointing at the server.
2. In the app's **Preview Deployments** settings, turn them on and set the wildcard domain to `*.yourdomain.com`. Previews get hosts like `preview-yourapp-abc123.yourdomain.com`. Without a wildcard, Dokploy hands out free `sslip.io` hosts instead.
3. Set the port to `3000`, and paste your Preview environment variables there.

Now each pull request against that branch gets its own copy of the app. New commits rebuild it, and closing or merging the PR cleans it up. Dokploy keeps 3 previews per app by default. `${{DOKPLOY_DEPLOY_URL}}` gives a preview its own URL, if your app needs to know it.

One warning from Dokploy's own docs: don't use previews on a public repo, because strangers could run builds on your server. If your previews need their own database, I wrote that up in [preview deployments with a cloned database](/blog/dokploy-preview-deployments-database).

## Step 6: Replace Vercel cron jobs

Crons in `vercel.json` call a route on a schedule. In Dokploy, open the app's **Schedules** tab and create a schedule job: a cron expression like `0 3 * * *` and a command that runs inside the app's container, such as `node scripts/nightly.js`. The container has to be running for it to fire.

When the app answers on its domain and everything checks out, remove the project from Vercel.

## The easier way: just ask Claude

Everything above means learning where Dokploy keeps things. You can skip most of that by connecting Dokploy to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

Before moving anything, I asked:

> I'm moving a Next.js app off Vercel to my Dokploy, with a preview for every pull request. Work out exactly what Dokploy needs from me for each step. Don't create anything yet.

Here's what happened:

1. Claude checked my Dokploy's version first: `v0.31.2`.
2. It read the tool that sets how an app builds. The options are `nixpacks`, `railpack`, `dockerfile`, `heroku_buildpacks`, `paketo_buildpacks` and `static`. It kept `nixpacks`, and noted `static` is only for a static export (`output: 'export'`), which loses server features.
3. It read the tool that adds a domain: a host, a port, `https` on and `certificateType` set to `letsencrypt`. Port `3000` for `next start`.
4. Then previews. It searched Zeqqat for "turn on preview deployments" and only found tools to list and redeploy previews, not to switch them on. So it read the app's settings tool instead, and the switch was there: `isPreviewDeploymentsActive`, next to `previewWildcard`, `previewPort`, `previewHttps`, `previewLimit`, `previewEnv` for the Preview variables, and `previewRequireCollaboratorPermissions`, which limits previews to people with access to the repo.
5. For the cron jobs, it found the tool that creates a scheduled job: a command run on a cron schedule inside a service.

Its answer was a plan of six calls, in order, with the two things I'd have missed flagged: `NEXT_PUBLIC_` variables need a rebuild, and the wildcard DNS record has to exist before previews get HTTPS. Pointing DNS away from Vercel is the one step it can't do through Dokploy, so it told me which record to change.

My Zeqqat connection allows reading, creating and editing, but delete is switched off, so Claude can set things up and can't remove anything. Every call carried the same one-line reason, so the activity log shows the whole check as one request.

## What I took from it

For a Next.js app, leaving Vercel is mostly the same four things: GitHub repo, build, variables, domain. Previews and crons need a few minutes more. The payoff is one server bill that doesn't grow when someone joins the team. And you don't have to learn Dokploy first if you'd rather ask your AI to do it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### What is the best open source alternative to Vercel?

Dokploy or Coolify. Both are open source dashboards you install on your own VPS. You deploy from GitHub, get HTTPS domains through Let's Encrypt, redeploy on every push and get a preview per pull request. Neither charges per seat, so the cost is just the server.

### Can I self-host Next.js without Vercel?

Yes. The Next.js docs say running it as a Node.js server or in a Docker container supports all Next.js features, including image optimization with `next start`. Dokploy builds a Next.js repo with Nixpacks by default and runs it on port 3000. If you run more than one copy of the app, read the Next.js self-hosting guide on sharing the cache between them.

### Does Dokploy have preview deployments like Vercel?

Yes, for GitHub repos. Turn them on in the app's Preview Deployments settings, add a wildcard domain like `*.yourdomain.com`, and each pull request gets its own copy of the app. It rebuilds on new commits and is removed when the pull request closes. Dokploy keeps 3 per app by default.
