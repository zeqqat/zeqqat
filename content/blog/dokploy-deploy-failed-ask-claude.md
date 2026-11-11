---
title: "I Asked Claude Why My Dokploy Deploys Failed. It Found Three Different Reasons"
seoTitle: "Dokploy Deploy Failed? How I Had Claude Read the Build Logs and Find the Cause"
description: "I asked Claude to find my failed Dokploy deployments through Zeqqat. Dokploy only said 'error'. The build logs said Node 18, a full disk and a missing repo."
date: "2026-11-08"
keywords: "dokploy deploy failed, dokploy build failed, dokploy deployment logs, nixpacks build failed, dokploy no space left on device, dokploy ai agent, dokploy mcp"
---

Every time a Dokploy deploy fails I do the same thing. Open the app, open Deployments, click the red one, scroll a few hundred lines of build output, find the line that matters.

Today I asked Claude to do it instead.

## What I did

I connected Claude to my Dokploy through Zeqqat and asked one question: which of my deploys failed, and why?

Claude searched for deployment tools, found one that lists recent deployments across every service, and ran it. It came back with 45 deployments. 42 were done. 3 were errors.

Here's the first thing I learned. Every one of those three records had `errorMessage: null`. Dokploy knows the deploy failed, but the deployment record doesn't say why. The only place the reason lives is the build log.

So Claude read the last lines of each log. Three failures, three completely different causes. (I changed the repo name in the logs below.)

## Failure 1: Node 18 couldn't load sharp

One of my apps is a Next.js 15 app built with Nixpacks. The build compiled fine, passed type checking, then died while collecting page data:

```
Error: Could not load the "sharp" module using the linux-x64 runtime
Possible solutions:
- Please upgrade Node.js:
    Found 18.20.5
    Requires >=20.9.0
> Build error occurred
Error: Failed to collect page data for /api/images/[...key]
```

Nixpacks had built it on Node 18. The image library my image route uses needs Node 20.9 or newer. The real error is a couple dozen lines above the last line, which just says "Nixpacks build failed". That's the line most people (me included) read first.

## Failure 2: the disk filled up

Five minutes later I deployed the same commit again. This time the log shows Nixpacks downloading `nodejs-20.18.1`, so the Node version had been sorted out. Then:

```
copying path '/nix/store/...-nodejs-20.18.1' from 'https://cache.nixos.org'...
error: writing to file: No space left on device
error: some substitutes for the outputs of derivation '...perl-5.40.0.drv' failed
  (usually happens due to networking issues); try '--fallback' to build derivation from source
❌ Nixpacks build failed
```

Look at that second line. Nix says the failure "usually happens due to networking issues". It wasn't the network. It was the disk. If I'd only read the end of the log, I'd have gone looking at DNS.

## Failure 3: the repo was gone

The third one, on a test app, failed in two seconds:

```
Cloning Repo Custom git@github.com:my-org/my-app.git ... ✅
ERROR: Repository not found.
fatal: Could not read from remote repository.
❌ [ERROR] Fail to clone the repository git@github.com:my-org/my-app.git
```

Note the green tick on the clone line, right before the clone fails. Dokploy prints the step, then git says the repo doesn't exist (or the deploy key can't see it). Nothing was ever built.

## What Claude couldn't do

The obvious next step for the disk problem is to clean Docker: old images, build cache, stopped containers. Dokploy has API calls for all of that.

Claude found them. It couldn't run them. My Zeqqat connection allows read, create and edit, and delete is off. Every cleanup call is a delete, so Zeqqat marks them as not allowed on my instance and refuses them before Dokploy hears about it.

That's what I want. Diagnosing is read only. Freeing disk space throws things away, and I'd rather look before anything gets thrown away.

Each call Claude made carried the same one-line reason, "Find out why my last Dokploy deploy failed". In Zeqqat's activity log they show up as one request: a list, three log reads, and the cleanup tools it looked up but couldn't touch.

## What I took from it

The answer to "why did my deploy fail" is almost never on the last line. It's somewhere in the last 50, and sometimes the tool even points you the wrong way. Reading those lines is tedious for me and easy for an agent. With delete off, it can do all of the looking and none of the damage.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Where do I find why a Dokploy deployment failed?

In the deployment's build log, not the deployment status. In the UI, open the application, go to Deployments and click the failed one. Over the API, `deployment.readLogs` with the deploymentId and a `tail` returns the last lines. The `errorMessage` field on the deployment record is often empty.

### Why does Nixpacks build my Node app with the wrong Node version?

Nixpacks picks a default Node version unless you tell it otherwise. Set `engines.node` in package.json (for example `">=20.9.0"`) or set the `NIXPACKS_NODE_VERSION` environment variable on the app, then redeploy. Libraries like sharp refuse to load on Node 18.

### What does "No space left on device" mean in a Dokploy build?

The server's disk filled up during the build, usually from old Docker images and build cache. Clean them from Dokploy's server settings or with `docker system prune`, and turn on Dokploy's automatic Docker cleanup so it doesn't come back.
