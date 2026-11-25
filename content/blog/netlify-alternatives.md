---
title: "Netlify Alternatives You Can Self-Host, and How to Move Your Site"
seoTitle: "Netlify Alternatives (2026): Self-Host Your Static Site on a VPS with Dokploy"
description: "The Netlify alternatives you can self-host in 2026, open source and free to run, and how to move a static site or single page app off Netlify to your own VPS with Dokploy, step by step."
date: "2026-11-25"
keywords: "netlify alternatives, netlify alternative, netlify alternative self hosted, netlify alternative open source, self host static site, move off netlify, netlify to dokploy, host static site on vps, dokploy static site, dokploy"
---

If you're looking for Netlify alternatives you can self-host, the one I use is **Dokploy**. It's open source and free to run. You connect a GitHub repo, it runs your build, serves the output with nginx, gives it a domain with HTTPS and redeploys on every push. It runs on a VPS you rent yourself, so the bill is the server, and the same server can hold your other sites, apps and databases too.

Below is why people leave Netlify, the other options, and how to move a site to Dokploy step by step. At the end I show the easier way, where I asked Claude to work out the move for me.

## Why people look for Netlify alternatives

Netlify is easy and the free plan is generous for one small site. People leave for two reasons.

**Everything is counted in credits now.** Netlify's plans are Free (300 credits a month), Personal ($9 a month, 1,000 credits) and Pro ($20 a month, 3,000 credits). A production deploy costs 15 credits, bandwidth 20 credits per GB, and compute and requests cost credits too (Netlify's pricing page, November 2026). On the Free plan, 20 deploys a month uses all 300 credits before anyone visits. Push often, or get a traffic spike, and you're watching a meter.

**One site per bill.** Most people with a Netlify site also have a backend, a database or a side project somewhere else. A VPS runs all of them for one flat price.

## Netlify alternatives at a glance

| | Open source | Where it runs | Deploy from GitHub | Runs your build | Domains and HTTPS |
|---|---|---|---|---|---|
| **Dokploy** | Yes | Your VPS | Yes, plus GitLab, Bitbucket, Gitea, any Git URL | Yes | Yes (Traefik, Let's Encrypt) |
| **Coolify** | Yes | Your VPS | Yes | Yes | Yes |
| **CapRover** | Yes | Your VPS | Through a webhook or its CLI | Yes, with a Dockerfile | Yes |
| **Vercel, Cloudflare** | No | Their cloud | Yes | Yes | Yes |

Vercel and Cloudflare are hosted platforms like Netlify, so you swap one bill for another. If you want a Netlify alternative that's open source and self-hosted, Dokploy and Coolify are the closest match. I compared them in [Coolify vs Dokploy](/blog/coolify-vs-dokploy), and CapRover in [Dokku vs CapRover vs Dokploy](/blog/dokku-vs-caprover-vs-dokploy). If your site is a Next.js app with a server, read [Vercel alternatives](/blog/vercel-alternatives) instead. The rest of this post is Dokploy and a static site.

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

## Step 2: Copy what's in Netlify

For your Netlify site, write down:

1. **The repo and branch** it deploys from.
2. **The build command and publish directory.** In **Site configuration**, then **Build & deploy**. For example `npm run build` and `dist`.
3. **The environment variables.**
4. **Your redirects**, from a `_redirects` file or `netlify.toml`.

Keep Netlify running until the very end. Nothing here touches it.

## Step 3: Deploy the site from GitHub

1. In Dokploy, create a project (call it anything).
2. Click **Create Service**, then **Application**.
3. In **Provider**, pick **GitHub** (connect your GitHub account once in Dokploy's Git settings), then the repo and branch. If the site lives in a folder of a monorepo, set **Build Path** to that folder.
4. In **Build Type**, pick **Nixpacks**. It installs your packages and runs the `build` script in your `package.json`, which covers Astro, Vite, React, Vue, Eleventy and most other site generators.
5. Fill in **Publish Directory** with the same folder Netlify used, like `dist`. This is the important part. With it set, Dokploy copies that folder out of the build and serves it with nginx. No start command needed.
6. If your site is a single page app (React Router, Vue Router), tick **Single Page Application (SPA)**. Every path then falls back to `index.html`, like the `/* /index.html 200` rule people put in Netlify's `_redirects`.
7. Open the **Environment** tab and paste your variables. Dokploy passes them to the build, which is what static sites need.
8. Click **Deploy** and watch the logs.

Turn on **Autodeploy** and every push to that branch redeploys, like on Netlify.

If your repo already holds the finished HTML and there's nothing to build, pick **Static** instead. It serves the files as they are, with nginx.

## Step 4: Add the domain with HTTPS

1. Open the app's **Domains** tab and click **Add Domain**.
2. Type the host, like `www.yourdomain.com`, and the **container port**: `80`, because nginx is serving the site.
3. Turn on **HTTPS** and choose **Let's Encrypt**.
4. At your DNS provider, point the host at the server's IP with an A record. If it was pointing at Netlify, replace it. On Cloudflare, keep it **DNS only** (grey cloud) until the certificate is issued.

## Step 5: Move redirects, and the Netlify-only parts

**Redirects.** In the app's **Advanced** tab there's a **Redirects** section. Each rule is a regex, a replacement and a permanent switch. Move your `_redirects` lines over one at a time. The SPA fallback is already handled by the checkbox in Step 3.

**Deploy previews.** Dokploy has preview deployments for GitHub repos, one copy of the site per pull request. I set them up in the [Vercel post](/blog/vercel-alternatives), and it works the same here.

**Netlify Forms and Functions don't come along.** They are Netlify features, not part of your site. A function can become a small Node app in the same Dokploy project, and a form needs a backend or a form service. If you don't use either, skip this.

When the site answers on its domain with HTTPS and everything checks out, delete the site from Netlify.

## The easier way: just ask Claude

Everything above means learning where Dokploy keeps things. You can skip most of that by connecting Dokploy to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

Before moving anything, I asked:

> I'm moving a Vite site off Netlify to my Dokploy. It's a single page app and it has a few redirects. Work out exactly what Dokploy needs from me. Don't create anything yet.

Here's what happened:

1. Claude checked my Dokploy's version first: `v0.31.4`.
2. It searched Zeqqat for "build type static publish directory" and found the tool that sets how an app builds. Its options are `nixpacks`, `railpack`, `dockerfile`, `heroku_buildpacks`, `paketo_buildpacks` and `static`, and next to them two fields that matter here: `publishDirectory` and `isStaticSpa`. It picked `nixpacks` with `publishDirectory` set to `dist` and `isStaticSpa` on, because `static` alone doesn't run a build.
3. It read the tool that adds a domain: a host, a port, `https` on and `certificateType` set to `letsencrypt`. Port `80`, since nginx serves the built site.
4. For the redirects, it searched "redirects" and found the tool that adds one. Each rule needs a `regex`, a `replacement` and `permanent` true or false. It said each line of my `_redirects` file becomes one rule in that shape, except the SPA line, since `isStaticSpa` already covers it.

Its answer was a plan of four calls, in order: create the app, set the build, add the domain, add the redirects. Pointing DNS away from Netlify is the one step it can't do through Dokploy, so it told me which record to change.

My Zeqqat connection allows reading, creating and editing, but delete is switched off, so Claude can set things up and can't remove anything. Every call carried the same one-line reason, so the activity log shows the whole check as one request.

## What I took from it

For a static site, leaving Netlify is four things: repo, build with a publish directory, domain, redirects. The one field people miss is **Publish Directory**. With it, Dokploy serves your built site with nginx and you pay for one server, however often you push. And you don't have to learn Dokploy first if you'd rather ask your AI to do it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### What is the best open source alternative to Netlify?

Dokploy or Coolify. Both are open source dashboards you install on your own VPS. You deploy from GitHub, they run your build, give you HTTPS domains through Let's Encrypt and redeploy on every push. Neither charges per deploy or per GB, so the cost is just the server.

### How do I host a static site on my own VPS?

Install Dokploy on the VPS, create an Application from your Git repo, choose Nixpacks as the build type and set Publish Directory to your build's output folder (like `dist`). Dokploy builds the site and serves that folder with nginx. Add your domain on port 80 with Let's Encrypt and you're done.

### Does Dokploy support single page apps and redirects like Netlify?

Yes. Tick Single Page Application (SPA) in the build settings and every path falls back to `index.html`. Other redirects go in the app's Advanced tab, under Redirects, as a regex and a replacement, permanent or not.
