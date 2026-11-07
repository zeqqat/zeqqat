---
title: "I Gave Claude My Dokploy and It Couldn't See My Secrets"
seoTitle: "I Gave Claude My Dokploy and It Couldn't See My Secrets"
description: "I connected Claude to my Dokploy through Zeqqat and pulled my app's full config. Every password and key came back as a handle the agent could use but never read."
date: "2026-11-07"
keywords: "dokploy mcp, dokploy ai agent, dokploy environment variables, dokploy secrets, claude dokploy, mcp gateway"
---

I wanted my AI agent to manage my Dokploy. Deploy, check logs, wire up a database. The things I do every day.

One thing stopped me. When an agent lists your applications through the Dokploy API, it gets your environment variables. In plain text. Database passwords, OAuth secrets, encryption keys. Someone in the Dokploy Discord found this out the hard way and had to rotate their keys.

And once a secret is in the model's context, it's out of your hands. It can end up in a log, a summary, a commit message. You don't get it back.

So I built Zeqqat to sit between the agent and Dokploy. Today I tested it on my own dev app.

## What I did

I connected Claude to my Dokploy through Zeqqat and asked it to look at the app behind dev.zeqqat.com. Claude listed my projects, found the app and pulled its full config.

This is the env block Claude got back (I shortened the hostnames):

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:{{zq_secret_ectc2gtuqax8cem2}}@my-db:5432/zeqqat
ZEQQAT_PUBLIC_URL=https://dev.zeqqat.com
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET={{zq_secret_e1iscp9ziygtdg2q}}
BETTER_AUTH_SECRET={{zq_secret_gp53vs4pxdnhyxb4}}
ZEQQAT_ENCRYPTION_KEY={{zq_secret_x8ssdj54zwxab2ie}}
```

Everything Claude needs to understand the app is there. The port, the public URL, which database it talks to. Every secret is a handle.

The Google client ID stays visible because it isn't a secret. The client secret is gone. Even the git refresh token Dokploy keeps for the app came back as a handle.

Claude never saw one of those values. Neither did the chat, and neither does Zeqqat's call log, which keeps the handles, not the values.

## But can the agent still do the work?

This is the part I cared about most. Hiding secrets is easy: delete them. But then the agent is useless the moment a task touches a secret.

Say I ask Claude to spin up a new Postgres and point my app at it. The password has to go in two places. With Zeqqat, Claude asks for a new secret, gets back a handle, and passes that handle into both calls. Zeqqat fills in the real value right before the request goes to Dokploy. The password exists, it works, and the model never had it.

The handles only work on that one connection and that one Dokploy instance. They expire after 30 minutes. Paste one anywhere else and it's just text.

## What it couldn't do

My connection allows read, create and edit. Delete is off. So even if Claude got confused and tried to delete a database, Zeqqat refuses before Dokploy ever hears about it.

Every call also carries a reason. When I open the activity log, I see what Claude was asked to do, in plain words, next to each call it made.

## What I took from it

I don't want to choose between giving my agent access and keeping my secrets. Now I don't have to. The agent sees the shape of my infrastructure and does the work. The secrets stay where they belong.

Zeqqat is free and open source. Self-host it or use [zeqqat.com](https://zeqqat.com). It works with Dokploy today, and more apps are coming. The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Does the official Dokploy MCP server show environment variables to the agent?

Yes. Tools that read an application return its env block as Dokploy stores it, so database passwords and API keys land in the model's context. Zeqqat replaces those values with handles before the response reaches the agent.

### What is a secret handle?

A placeholder like `{{zq_secret_...}}` that stands in for a secret. The agent can pass it into a later call, and Zeqqat swaps in the real value just before the request goes to Dokploy. Handles only work on the connection and instance they came from, and expire after 30 minutes.

### Can I stop the agent from deleting things in Dokploy?

Yes. Each Zeqqat connection has its own permissions. You can allow read, create and edit and turn delete off, or allow only specific tools. A blocked call is refused by Zeqqat and never sent to Dokploy.
