---
title: "I Asked Claude Which of My Dokploy Apps I Could Roll Back. None of Them Could Be"
seoTitle: "Dokploy Rollback Not Working? How I Had Claude Check Every App's Rollback Setup"
description: "I asked Claude to check, through Zeqqat, which of my Dokploy apps I could roll back after a bad deploy. Six apps, 42 deployments, zero rollback images. Here's why, and what it takes to fix."
date: "2026-11-12"
keywords: "dokploy rollback, dokploy rollback not working, dokploy rollback registry, dokploy rollback button missing, dokploy revert deployment, dokploy swarm rollback, dokploy ai agent, dokploy mcp"
---

Every app I run on Dokploy deploys on push. I push to main, Dokploy builds, the new version goes live. That's great until a push breaks something.

I've always assumed that if that happened, I'd just roll back. Dokploy has a rollback feature. I'd never actually checked that I could use it.

So this morning I asked Claude: if a deploy broke one of my apps right now, which ones could I roll back?

## What I did

Claude is connected to my Dokploy through Zeqqat, on a connection that can read, create and edit, but not delete. For this it only needed to read.

It searched Zeqqat for "rollback" first. Two tools came back: `rollback.rollback`, which rolls an app back to an earlier image, and `rollback.delete`, which deletes a saved rollback image. My connection can't run the second one. There's no tool that lists the rollback images an app has.

So Claude worked it out from the apps themselves. It listed my projects (six applications and four compose stacks), then fetched each application's full details. Every deployment in an app's history carries a `rollbackId` field. If a deployment saved an image you can roll back to, that field points at it.

Here's what came back.

| Check | Result |
| --- | --- |
| Applications with rollbacks turned on | 0 of 6 |
| Applications with a rollback registry | 0 of 6 |
| Container registries set up in Dokploy at all | 0 |
| Deployments with a rollback image | 0 of 42 |
| Applications with a Swarm health check or update config | 0 of 6 |

Six apps, 42 deployments in their history, and not one thing to roll back to.

## Why there was nothing to roll back to

Dokploy's rollbacks aren't on by default, and they need a container registry. When you turn them on (Deployments, then Rollback Settings), you pick a registry, and from then on Dokploy tags each deployment's image and pushes it there. The Rollback button next to a deployment redeploys that saved image.

I never set up a registry. Dokploy builds my images on the server and runs them from there. So there was nowhere to keep old images, rollbacks were never enabled, and every deployment came back with `rollbackId: null`.

The other kind of rollback Dokploy has is Docker Swarm's. You give the app a health check and an update config with `"FailureAction": "rollback"`, and if a new version fails its health check, Swarm puts the previous one back by itself. Claude checked those fields too. All six were empty.

Two more things stood out.

One app has never had a good deploy. Both deployments in its history failed. Even with rollbacks turned on, there would be nothing to go back to.

Another app shows the same commit deployed four times, weeks apart. That's what "Redeploy" does: it rebuilds whatever is on the branch. It's not a rollback. If the branch is broken, a redeploy just builds the broken version again.

And the four compose stacks can't use the Rollback button at all. Dokploy's registry rollbacks are for applications only.

## What Claude didn't do

It could have started fixing this. My connection is allowed to create a registry and edit an app's settings. It didn't, because I asked a question, and the fix needs things only I can decide: which registry to use, its credentials, and where old images should live. It also didn't touch any running app.

Every call carried the same reason, "Check which of my Dokploy apps could be rolled back if a deploy went wrong", so in Zeqqat's activity log it reads as one request: a search, a project list, six app lookups and a registry list.

## What I'm left with

Right now my rollback plan is `git revert` and push, then wait for a full build. That works, but it's slow, and it's not what I thought I had.

The bigger lesson is the same one as when I [checked my backups](/blog/dokploy-database-backups-check): a safety feature you've never checked is a safety feature you might not have. Dokploy won't warn you that rollbacks are off. You find out the day you need the button and it isn't there. Asking an agent to check every app took a few minutes.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Why is there no rollback button in Dokploy?

Rollbacks are off until you enable them for each application under Deployments, then Rollback Settings, and enabling them needs a container registry (Docker Hub, GHCR or your own) set up in Dokploy first. From then on, each deployment pushes an image you can roll back to.

### Can I roll back a Docker Compose service in Dokploy?

Not with the Rollback button. Dokploy's registry-based rollbacks are for applications only. For a compose service, revert the change in git (or pin the previous image tag in the compose file) and redeploy.

### Is Redeploy the same as a rollback in Dokploy?

No. Redeploy rebuilds the app from the current state of its branch, or pulls the current image tag. If the latest commit is the broken one, a redeploy builds it again. A rollback runs an earlier saved image instead.
