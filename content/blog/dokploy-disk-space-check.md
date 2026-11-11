---
title: "I Asked Claude What's Filling My Dokploy Server's Disk. Cleanup Could Free Almost None of It"
seoTitle: "Dokploy Disk Space Full? How I Had Claude Find What's Using It"
description: "I asked Claude to check what's using disk on my Dokploy server through Zeqqat. 8.4 GB in Docker, and a cleanup could free about 420 MB. The rest belongs to things that are still running."
date: "2026-11-11"
keywords: "dokploy disk space, dokploy disk full, dokploy docker cleanup, dokploy no space left on device, docker system df, dokploy unused volumes, dokploy ai agent, dokploy mcp"
---

A few days ago I wrote about [a Dokploy build that failed](/blog/dokploy-deploy-failed-ask-claude) with `No space left on device`. I found the failure. I never found out what was actually filling the disk.

So this morning I asked Claude: what's using the space on my Dokploy server, and how much of it can I get back?

## What I did

Claude is connected to my Dokploy through Zeqqat, on a connection that can read, create and edit, but not delete. Every call it made carried the same reason, "Check what is using disk space on my Dokploy server", so the whole check shows up as one request in Zeqqat's activity log.

It made four reads. Docker's disk usage, the list of containers, the server's settings, and the log cleanup schedule. That was enough.

## What came back

Dokploy's disk usage endpoint gives you Docker's own breakdown, the same four rows you get from `docker system df`:

| Type | Count | In use | Size | Reclaimable |
|---|---|---|---|---|
| Images | 16 | 16 | 7.53 GB | 320.8 MB (4%) |
| Containers | 21 | 21 | 226.8 kB | 0 B |
| Local volumes | 14 | 12 | 915.5 MB | 98.94 MB (10%) |
| Build cache | 0 | 0 | 0 B | 0 B |

So Docker holds about 8.4 GB on this server, and a full cleanup would give back roughly 420 MB. That's 5%.

I expected the opposite. Every guide about a full Dokploy disk says to prune Docker, and I assumed I'd find gigabytes of old images and build cache. There was no build cache at all. Claude checked the settings and found automatic Docker cleanup is already turned on for this server, and the log cleanup runs every night at midnight. The obvious stuff was already being cleaned.

## Where the space actually is

Images. 7.5 of the 8.4 GB, and all 16 are in use by a running container. Docker won't remove an image a container uses, and neither will any cleanup button.

Claude listed the containers to see who's holding them. Every one was running. Among them, three separate copies of Zeqqat that I'd installed while testing, each on a different version: one on `0.1.0`, one on `0.3.12`, one on `latest`. That's three different images kept around because three test installs are still up, one of them for six days. There were also four different Postgres images (versions 15, 16, 17 and pgvector on 18) because different projects picked different versions.

None of that is waste Docker can see. It's things I started and forgot about. The only way to get that space back is to stop the ones I don't need, and that's a decision, not a cleanup.

## The 99 MB I left alone

Two of the fourteen volumes aren't attached to any container. That's the 98.94 MB Docker calls reclaimable.

"Unused" means no container has it mounted right now. It doesn't mean empty. A volume left behind by a database you removed still has that database's data in it. Dokploy's "clean unused volumes" deletes them with their data, and you can't get it back.

Claude couldn't have run it anyway. Every cleanup action is classed as delete in Zeqqat, and my connection doesn't allow delete. When Claude searched for them, they came back with no instance they're allowed to run on. I'm glad. "Free up some disk" is exactly the kind of request where an agent might reasonably reach for prune.

## What it couldn't tell me

How full the disk is. The disk usage endpoint only counts what Docker owns. It doesn't say how big the disk is, and it doesn't count anything outside Docker. Dokploy can report real disk metrics through its monitoring, but the server's monitoring isn't set up (its token is empty in the settings), so that read needs a URL and token this server doesn't have.

It also couldn't say which image is the big one. Dokploy gives the totals per type, not a list of images with sizes, so "7.53 GB of images" is as specific as it gets over the API.

## What I took from it

When a Dokploy disk fills up, pruning is the first thing everyone says. On my server, with cleanup already on, pruning would have freed 5%. The space was in images that running containers need, and the fix is stopping what I don't use anymore. An agent can show you that in four calls. Deciding what to stop is still my job, and I'd rather it stays that way.

Zeqqat is free and open source. Self-host it or use [zeqqat.com](https://zeqqat.com). It works with Dokploy today, and more apps are coming. The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### How do I free up disk space on a Dokploy server?

First check what's using it. On the server, `docker system df` shows images, containers, volumes and build cache with how much of each is reclaimable. If build cache or unused images are large, Dokploy's clean actions in the server settings will clear them. If most of the space is images that running containers use, cleanup can't touch it: stop or remove the apps and test installs you no longer need, then clean up.

### Is it safe to delete unused Docker volumes in Dokploy?

Not without checking. An unused volume is one that no container has mounted right now, and it can still hold the data of a database you removed or stopped. Deleting it deletes that data for good. Look at what each one is before you remove it, and back up anything you might want.

### Why does Dokploy say "no space left on device" when Docker cleanup is on?

Cleanup can only remove what nothing is using. Images used by running containers stay, and so does everything outside Docker, like logs, backups written to disk, and other files on the server. Check `docker system df` and `df -h` together to see which side is full.
