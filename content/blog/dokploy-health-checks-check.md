---
title: "I Asked Claude Which of My Dokploy Containers Have a Health Check. Only the Ones From Compose Files Did"
seoTitle: "Dokploy Health Checks: How I Had Claude Check Every Container"
description: "I asked Claude, through Zeqqat, which of my Dokploy apps and databases have a health check. 18 running containers, 7 with one, and every one of those came from a compose file. Here's how it checked and what a health check changes."
date: "2026-11-14"
keywords: "dokploy health check, dokploy healthcheck, dokploy swarm health check, dokploy zero downtime deploy, dokploy container unhealthy, docker swarm healthcheck, dokploy ai agent, dokploy mcp"
---

When a deploy in Dokploy finishes, the status goes green and the container says "Up". I've always read that as "the app works".

It doesn't mean that. "Up" means the process started. Whether it answers a request is a different question, and the thing that asks it is a health check.

So this morning I asked Claude: which of my Dokploy containers have a health check?

## What I did

Claude is connected to my Dokploy through Zeqqat, on a connection that can read, create and edit, but not delete. For this it only needed to read.

It searched Zeqqat for "health check" first. What came back were checks on Dokploy itself (`settings.health` and `settings.checkInfrastructureHealth`, which look at Dokploy's own database, Redis and Traefik), not on my services. No tool answers "which of my apps have a health check".

So it did two things.

First, it listed every container on the server with `docker.getContainers`. That returns the same status text as `docker ps`, and Docker adds "(healthy)" or "(unhealthy)" to the status only when the container has a health check. No suffix means there's nothing checking it.

Then it read the settings of one app and one database to see why. In Dokploy, an app's or database's health check lives in a field called `healthCheckSwarm`. On both, it was `null`.

Here's what came back.

| Check | Result |
| --- | --- |
| Running containers | 18 |
| With a health check (status says "healthy") | 7 |
| Without one | 11 |
| Dokploy applications without one | 5 of 5 |
| Dokploy managed Postgres databases without one | 5 of 5 |
| Compose containers without one | 1 (an old install whose compose file had no `healthcheck`) |

Every one of the 7 healthy containers was in a compose stack. The apps and databases I created through Dokploy's own forms had none. There was also one exited container left over from a redeploy, which is normal.

## Why the split is so clean

It comes down to where the setting lives.

In a compose stack, the health check is written in the compose file. Most published compose files for apps like Umami or Postgres already include one, so you get it without thinking about it. A typical one looks like this:

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U app -d app"]
  interval: 10s
  timeout: 5s
  retries: 5
```

An application or database created in Dokploy runs as a Docker Swarm service, and its health check is the `healthCheckSwarm` setting. It's empty by default. If the image itself has a `HEALTHCHECK` line in its Dockerfile, Docker uses that, but neither my app images nor the official `postgres` image ship one. So nothing was checking them.

## What a health check actually changes

Without one, Docker only knows whether the process is alive. An app that started but can't reach its database, or is stuck, still shows "Up" and stays that way.

With one, two things change for Swarm services, which is what Dokploy apps and databases are:

1. **A broken container gets replaced.** When the check fails enough times in a row, Swarm marks the task unhealthy, stops it and starts a new one.
2. **Deploys can wait for the new version to work.** With a health check and an update order of `start-first`, Swarm starts the new container, waits for it to pass, and only then stops the old one. Without a check, "started" is all it waits for.

Compose stacks are a little different. By default Dokploy runs them with Docker Compose, which reports "healthy" or "unhealthy" but doesn't replace an unhealthy container on its own. There, the check is mostly useful for `depends_on` with `condition: service_healthy`, so an app waits for its database before starting.

## How you'd set one in Dokploy

For an application, it's under Advanced, in the Swarm settings, as a JSON block. Through the API it's `application.update` with `healthCheckSwarm`, which takes `Test`, `Interval`, `Timeout`, `StartPeriod` and `Retries`. The times are in nanoseconds, so 30 seconds is `30000000000`:

```json
{
  "Test": ["CMD", "curl", "-f", "http://localhost:3000/api/health"],
  "Interval": 30000000000,
  "Timeout": 5000000000,
  "StartPeriod": 30000000000,
  "Retries": 3
}
```

Two things to watch. The command runs inside the container, so `curl` or `wget` has to be in the image (slim images often have neither). And the app needs something cheap to check, like a `/health` route that answers without doing real work. It takes effect on the next deploy.

## What Claude didn't do

It could have added them. My connection is allowed to edit an app's settings, and `application.update` takes `healthCheckSwarm` directly. It didn't, because I asked a question. A health check pointed at the wrong port or path, or one that calls a tool the image doesn't have, fails every time, and then Swarm keeps killing a container that was working fine. Picking the command needs someone who knows the app.

Every call carried the same reason, "Check which of my Dokploy apps have a health check", so in Zeqqat's activity log it reads as one request: three searches, a project list, the container list, one app, one database and a look at the update tool.

## What I'm left with

Ten services that Docker can only call "Up", including every database Dokploy created for me. The ones that did have checks only had them because whoever wrote the compose file put them there.

This is the same pattern as [memory limits](/blog/dokploy-memory-limits-check) and [rollbacks](/blog/dokploy-rollback-check). Dokploy leaves the field empty, and an empty field looks the same as a choice. One container list was enough to see it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Does Dokploy add health checks to applications and databases by default?

No. An application's or database's `healthCheckSwarm` setting is empty until you fill it in. Docker will still use a `HEALTHCHECK` from the image's Dockerfile if there is one, but the official Postgres images don't have one. You can tell by running `docker ps`: a container with a health check shows "(healthy)" or "(unhealthy)" after "Up".

### What units does Dokploy's Swarm health check use?

Nanoseconds, because the values go straight to the Docker Swarm API. 30 seconds is `30000000000` and 5 seconds is `5000000000`. `Test` is the command as a list, like `["CMD", "curl", "-f", "http://localhost:3000/health"]`, and `Retries` is a plain number.

### Does a health check give me zero downtime deploys in Dokploy?

It's half of it. Swarm needs a health check to know the new container actually works, and an update order of `start-first` so it starts the new one before stopping the old. With both, the old container keeps serving until the new one passes. Without a health check, Swarm switches over as soon as the new process starts.
