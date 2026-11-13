---
title: "I Asked Claude Which of My Dokploy Containers Have a Memory Limit. Not One of Them Did"
seoTitle: "Dokploy Memory and CPU Limits: How I Had Claude Check Every Container"
description: "I asked Claude, through Zeqqat, which of my Dokploy apps and databases have memory or CPU limits. 21 running containers, zero limits. Here's how it checked, and what a limit actually does."
date: "2026-11-13"
keywords: "dokploy memory limit, dokploy cpu limit, dokploy resource limits, dokploy container out of memory, dokploy server crashed memory, docker swarm memory limit, dokploy ai agent, dokploy mcp"
---

I run everything on one Dokploy server with about 7.6 GB of memory. Apps, their databases, a few test installs, an analytics stack, and Dokploy itself.

I've never had a container take the server down. I've also never checked what would stop one from doing it.

So this morning I asked Claude: which of my Dokploy containers have a memory or CPU limit?

## What I did

Claude is connected to my Dokploy through Zeqqat, on a connection that can read, create and edit, but not delete. For this it only needed to read.

It searched Zeqqat for "memory limit cpu" first. No tool lists limits directly. What came back were metrics tools: per app monitoring, server metrics, and `swarm.getContainerStats`, which returns `docker stats` for every container on the server.

So it did two things.

First, it listed my projects (six applications, six Postgres databases and five compose stacks) and read the settings of an app and a database. In Dokploy, limits live on the service itself as four fields: `memoryReservation`, `memoryLimit`, `cpuReservation` and `cpuLimit`. On both, all four were `null`.

Then it pulled the live stats, which is the quicker way to check everything at once. `docker stats` shows memory as "used / limit". When a container has no limit, the number after the slash is the whole machine's memory.

Here's what came back.

| Check | Result |
| --- | --- |
| Running containers | 21 |
| Containers whose memory ceiling was the whole server (7.596 GiB) | 21 of 21 |
| Memory in use across all of them | about 1.8 GiB |
| Biggest single container | Dokploy itself, about 700 MiB |
| Next biggest | an analytics app, about 230 MiB |
| Everything else | under 90 MiB each |

Every container, mine and Dokploy's own (Traefik, Dokploy's Postgres, the Dokploy app), was allowed to use all of the server's memory.

## Why that matters even when usage is low

Right now the server is fine. Less than a quarter of its memory is in use, and CPU was close to zero across the board.

The problem is what happens on a bad day. A memory leak, a runaway query, or a build that eats more than expected doesn't stop at its own container. With no limit, it keeps taking memory until the kernel runs out and starts killing processes. The kernel picks what to kill, and it doesn't know which container matters. It can be your database. It can be Traefik, and then every site on the server stops answering. It can be Dokploy, and then you can't even get in to fix it.

A memory limit changes who pays. If one app goes over its limit, that app's container gets killed and restarted, and everything else keeps running.

A reservation is the other half. It tells Docker how much memory a service needs to start, so it won't be squeezed onto a node that can't hold it. On a single server it matters less than the limit.

## What a sensible limit looks like

The stats give you a starting point. An app sitting at 80 MiB doesn't need a gigabyte. Something like 2 to 4 times its normal usage leaves room for spikes without letting it take the server.

In Dokploy, limits are set per service under Advanced, then Resources. They're Docker Swarm values: memory in bytes (512 MB is `536870912`) and CPU in nano CPUs (one CPU is `1000000000`). Apps and databases both have them. A compose stack doesn't use these fields; its limits go in the compose file itself, under `deploy.resources.limits` or `mem_limit`.

Dokploy's own containers (Traefik, its Postgres and the Dokploy app) are set up by Dokploy, not by me, so I'm leaving them alone.

## What Claude didn't do

It could have set the limits. My connection is allowed to edit an app's settings, and `application.update` takes `memoryLimit` and `cpuLimit` directly. It didn't, because I asked a question, and picking a limit is a judgment call. Too low and an app that was fine starts getting killed under normal load. A new limit also only applies after a redeploy, and it didn't redeploy anything either.

Every call carried the same reason, "Check which of my Dokploy apps have memory and CPU limits set", so in Zeqqat's activity log it reads as one request: a search, a project list, an app, a database, one stats call and a look at the update tool.

## What I'm left with

Twenty-one containers sharing 7.6 GB with nothing stopping any one of them from taking all of it. It hasn't gone wrong yet. That's the same thing I told myself about [backups](/blog/dokploy-database-backups-check) and [rollbacks](/blog/dokploy-rollback-check), and both turned out to be missing when I looked.

Dokploy doesn't warn you that a service has no limit. The fields are empty by default, and an empty field looks the same as a setting you chose. Asking an agent to check took one stats call.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Does Dokploy set memory limits on containers by default?

No. An application's or database's memory and CPU limits are empty until you set them under Advanced, then Resources. With no limit, a container can use all of the server's memory, which you can see in `docker stats`: the number after the slash is the host's total memory.

### What units does Dokploy use for memory and CPU limits?

They're passed to Docker Swarm, so memory is in bytes and CPU is in nano CPUs. 512 MB is `536870912`, 1 GB is `1073741824`, and one full CPU is `1000000000`. The service needs a redeploy before a new limit applies.

### What happens when a Dokploy container hits its memory limit?

Docker kills that container for running out of memory, and Swarm starts it again. The rest of the server keeps running. Without a limit, the server itself runs out of memory instead, and the kernel kills whatever it chooses, which can be your database, Traefik or Dokploy.
