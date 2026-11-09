---
title: "I Asked Claude Which of My Dokploy Databases Are Backed Up. Three Weren't, and One Was Failing Every Night"
seoTitle: "Are My Dokploy Database Backups Working? How I Had Claude Check Every One"
description: "I asked Claude to check backups on every database in my Dokploy through Zeqqat. Three had none, and one had failed every night for six days with no alert."
date: "2026-11-09"
keywords: "dokploy backups, dokploy database backup, dokploy backup failed, dokploy container not found, dokploy s3 backup, dokploy r2 backup, dokploy compose backup, dokploy ai agent, dokploy mcp"
---

I set up backups in Dokploy a few weeks ago. Cloudflare R2 as the destination, daily at midnight, keep the last seven. Then I stopped thinking about it.

That's the problem with backups. You only look at them when you need one.

So this morning I asked Claude to look for me: which of my databases are backed up, and are the backups actually working?

## What I did

Claude is connected to my Dokploy through Zeqqat, on a connection that can read, create and edit, but not delete. I asked one question and let it work.

It started with the destinations. One: my R2 bucket. Then it listed my projects, found six Postgres databases and two compose stacks that run their own Postgres, and opened each one to read its backup schedule and its recent backup runs.

Here's what came back.

| Database | Backup | Last 11 nights |
|---|---|---|
| Dokploy itself | daily, keep 3 | all done |
| zeqqat-registry-db | daily, keep 7 | all done |
| zeqqat-lab-dev-db | daily, keep 7 | all done |
| pgtest-source, pgtest-target | daily, keep 7 | all done |
| pamoja-db | daily, keep 7 | **5 done, then 6 errors** |
| zeqqat-db | **none** | |
| Umami's Postgres (compose) | **none** | |
| Self-hosted Zeqqat's Postgres (compose) | **none** | |

Two of those surprised me.

## Surprise 1: pamoja-db has failed every night since November 4

Every run from October 30 to November 3 was fine. Every run from November 4 on is an error, and each one fails in under a second.

The run records don't say why. Every one has `errorMessage: null`. So Claude read the log of last night's run:

```
Initializing backup
[Mon Nov  9 00:00:00 UTC 2026] Starting backup process...
[Mon Nov  9 00:00:00 UTC 2026] Executing backup command...
[Mon Nov  9 00:00:00 UTC 2026] ❌ Error: Container not found
```

There's no container to back up. In Dokploy the database shows as `idle`, and so does the app that uses it. Nothing is running, but the schedule kept going, failing quietly at midnight every night. Nobody told me. Claude checked that too: I have zero notification channels set up in Dokploy, so a failed backup goes nowhere.

Then Claude checked the bucket. The seven newest files for pamoja-db are from October 28 to November 3. A failed run uploads nothing, so it also prunes nothing, and the last good copies are still there. That's the good news.

The less good news: each file is about 390 bytes. That's a gzipped dump with almost nothing in it. Compare the registry database, whose nightly dumps are about 45 KB each. So these backups "worked", they just backed up a nearly empty database. For pamoja that's fine. For a database that matters, a size check is the only way you'd notice.

## Surprise 2: the database behind zeqqat.com has no backup

`zeqqat-db` is the Postgres for zeqqat.com itself. I created it on November 4, after I'd set up backups for everything else. I never went back and added one.

The two compose stacks are the same story. Umami (my site analytics) and a self-hosted Zeqqat I installed yesterday both run Postgres inside a compose file. Dokploy can back up a database inside a compose service, but you set it up per service, and I hadn't.

None of this was hidden. It was all one click away in the Dokploy UI. I just never clicked through eight databases to check.

## What Claude didn't do

Claude could have created the missing backup schedules. My connection allows create. It didn't, because I asked it to check, not to change, and a new backup schedule on a production database is my call. Adding them is a two-minute job now that I know which ones.

It also never saw a password. The database records came back with handles like `{{zq_secret_ar9nll0vo3g05fgr}}` where the password would be, and the R2 access keys came back the same way. Zeqqat swaps the real values out before the agent sees them.

Every call carried the same reason, "Check which of my Dokploy databases have backups set up", so in Zeqqat's activity log the whole check reads as one request: a destination list, a project list, eight database reads, one log read, a few bucket listings and the notification list.

## What I took from it

"Backups are set up" is three separate claims. A schedule exists. The runs succeed. The files contain your data. I had the first one for most databases and assumed the other two. An agent can check all three across every database in a minute, which is a check I was never going to do by hand on a Monday morning.

Zeqqat is free and open source. Self-host it or use [zeqqat.com](https://zeqqat.com). It works with Dokploy today, and more apps are coming. The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### How do I know if my Dokploy database backups are working?

Open the database in Dokploy, go to Backups, and look at the recent runs for each schedule. A red run means it failed, and the reason is in that run's log, not in the run's status. Add a notification channel (Slack, Discord, Telegram or email) in Dokploy's settings so a failed backup reaches you. Then check the files in your S3 bucket: a backup that's much smaller than you expect may have dumped an empty or wrong database.

### Why does a Dokploy backup fail with "Container not found"?

The backup runs the dump inside the database's container, so if the database is stopped or was never deployed, there's nothing to run it in. Start the database again, or turn off the backup schedule if you've retired it. Failed runs don't upload anything, so your older backups stay in the bucket.

### Can Dokploy back up a database that runs inside a Docker Compose service?

Yes. Open the compose service, go to Backups, and add one for the service that runs the database, with its database type, name and user. Dokploy doesn't create these automatically, so a compose stack with Postgres inside has no backups until you add one.
