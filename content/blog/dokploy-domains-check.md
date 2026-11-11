---
title: "I Asked Claude Which of My Dokploy Domains Actually Load. Five Never Could"
seoTitle: "Dokploy Domain Not Working? How I Had Claude Check Every Domain on My Server"
description: "I asked Claude to check every domain on my Dokploy server through Zeqqat. Six loaded. Five were sslip.io domains that could never load, and three services had nothing else."
date: "2026-11-10"
keywords: "dokploy domain not working, dokploy sslip.io, dokploy domain not loading, dokploy cloudflare tunnel, dokploy generate domain, dokploy app not accessible, dokploy ai agent, dokploy mcp"
---

Dokploy tells you a service deployed. It shows a green "done". It does not tell you whether anyone on the internet can open it.

I have eleven domains on one Dokploy server, spread across my apps and compose stacks. I've never checked them all at once. So this morning I asked Claude to do it: list every domain, then try to load each one from the outside.

## What I did

Claude is connected to my Dokploy through Zeqqat, on a connection that can read, create and edit, but not delete. It only needed to read.

Dokploy has no "list every domain" call. Domains hang off each app or compose service. So Claude listed my projects, then asked for the domains of each service, one call each. Ten calls, eleven domains.

Then it checked each address with `zeqqat_check`, which loads the address from zeqqat.com, on the open internet, and says what happened. That matters. Claude's own sandbox can't tell you if your site is reachable from the outside. It's somewhere else on the network with its own rules.

Here's what came back, grouped by how the domain got there.

| Kind of domain | How many | Result |
| --- | --- | --- |
| A domain I added myself | 6 | all live |
| A free sslip.io domain Dokploy generated | 5 | **all unreachable** |

Some of the live ones answered with a redirect to their sign-in page. That counts as loading.

Every domain I typed in myself works. Every domain Dokploy generated for me does not.

## Why the sslip.io domains never worked

When you create a service from a template, or click Generate on the Domains tab, Dokploy gives you a free hostname on sslip.io. sslip.io is a DNS service that answers with whatever IP is written in the name. So a generated domain points straight at your server's public IP.

My server doesn't take traffic that way. It only takes web traffic through Cloudflare (I wrote about that setup in [Dokploy behind Cloudflare](/blog/dokploy-behind-cloudflare)). All six working domains resolve to Cloudflare, and Cloudflare brings the traffic in. The `zeqqat_check` result said why the others failed, in plain words: "Nothing answered from the internet. The server's cloud firewall most likely blocks ports 80 and 443 (common when a server only takes traffic through Cloudflare or a tunnel)."

So the domains I added go through Cloudflare and work. The sslip.io ones skip Cloudflare, go straight to the server, and time out. They were dead the moment Dokploy created them. Dokploy had no way to know.

## The part that actually matters

Five dead domains is just clutter. Two of them sit next to a working domain on the same service, so nothing is lost.

The other three are the only domain their service has. All three services show "done" in Dokploy. None of them can be opened by anyone.

Two were throwaway tests, so that's fine. The third one is a little embarrassing: it's a Zeqqat I installed from the Dokploy template, the way my own docs tell people to, and it ended up with an address nobody can reach.

If your Dokploy only takes traffic through Cloudflare, the same thing will happen to you with any template. The generated domain won't work. You'll need to add your own.

## What Claude didn't do

It could have added domains. My connection allows create and edit. It didn't, because I asked it to check, and a new hostname needs a DNS record and a tunnel route that only I can set up in Cloudflare. It also didn't touch the dead sslip.io domains. My connection can't delete, and even if it could, cleaning up is my call.

Every call carried the same reason, "Check which of my Dokploy domains actually load", so in Zeqqat's activity log the whole thing reads as one request: a project list, ten domain lookups and the address checks.

## What I took from it

"Deployed" and "reachable" are two different facts, and Dokploy only shows you the first one. The second one depends on DNS, Cloudflare, a tunnel and a firewall that Dokploy can't see. Checking it means actually loading the address from somewhere outside, for every domain. That's tedious by hand and quick for an agent.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Why is my Dokploy sslip.io domain not working?

An sslip.io domain resolves to the IP written inside it, which is your server's public IP. If your server only takes traffic through a Cloudflare Tunnel, or a firewall blocks ports 80 and 443 to anything but Cloudflare, nothing answers on that IP and the domain times out. Add a domain of your own that goes through Cloudflare instead, or open ports 80 and 443 if you want the generated one to work.

### Why does my Dokploy app say done but the domain doesn't load?

"Done" means the build and deploy finished. It says nothing about DNS, your firewall or Cloudflare. Check that the domain's DNS record points where you think, that ports 80 and 443 are open (or that your tunnel has a route for that hostname), and load the address from a network outside your server to see what a visitor sees.

### Do I need Let's Encrypt on a Dokploy domain behind a Cloudflare Tunnel?

No. Cloudflare serves the certificate visitors see, and the hop through the tunnel is already encrypted. Route the tunnel to Traefik at `http://localhost:80` and turn HTTPS off on the domain in Dokploy, with the certificate set to None.
