---
title: "How to Host OpenClaw on a VPS (Securely) with Dokploy"
seoTitle: "How to Host OpenClaw on a VPS Securely: Dokploy Template, HTTPS and a Locked Gateway"
description: "How to host OpenClaw on a VPS securely: install Dokploy, deploy the OpenClaw template, put it on HTTPS, and close the one setting the template leaves open."
date: "2026-11-15"
keywords: "how to host openclaw on vps, how to host openclaw securely, openclaw vps, self host openclaw, openclaw docker, openclaw dokploy, openclaw https, openclaw gateway token"
---

If you want to know how to host OpenClaw on a VPS, the short answer is: rent a small Linux server, install Dokploy on it, and deploy OpenClaw from Dokploy's template. You get a password-protected web UI on your own domain with HTTPS, and you never write a Docker command. Doing it securely takes four more minutes, and I'll show you exactly which settings matter.

I'll go step by step, written for someone who has never self-hosted anything. Then I'll show the easier way, where I just asked Claude to do it.

## What you need

- **A VPS.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk. OpenClaw's template also runs a Chrome container next to it (that's how OpenClaw browses websites), so I'd pick 4 GB. Hetzner, DigitalOcean, Hostinger and others all work. Choose Ubuntu or Debian.
- **A domain** you can add a DNS record to. You can start without one, but you need one for HTTPS, and you want HTTPS.
- **An API key for a model.** The template expects an OpenRouter key by default. It also reads Anthropic, OpenAI, Gemini and many others.

## Step 1: Install Dokploy

SSH into your server and run Dokploy's install script:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Ports 80, 443 and 3000 must be free first, or the install fails. When it finishes, open `http://your-server-ip:3000` in your browser and create your admin account.

## Step 2: Deploy the OpenClaw template

Dokploy has a gallery of one-click templates, and OpenClaw is one of them.

1. Create a project (call it anything, like "openclaw").
2. Inside it, click **Create Service**, choose **Template**, search for **Openclaw** and create it.

Dokploy creates a Docker Compose service with two containers: `openclaw` (the agent, with an nginx login page in front of it) and `browser` (the Chrome it drives). It also fills in the environment for you:

- `AUTH_USERNAME=dokploy` and a random 32-character `AUTH_PASSWORD`. This is the login for the web UI.
- A random 32-character `OPENCLAW_GATEWAY_TOKEN`. The Control UI asks for it when it connects to the gateway.
- `OPENROUTER_API_KEY="YOUR-API-KEY"`. A placeholder you have to replace.

Don't deploy yet. First fix the environment.

## Step 3: Set the environment (this is where security happens)

Open the service's **Environment** tab.

1. **Put in your model key.** Replace `YOUR-API-KEY` with your OpenRouter key. If you use Anthropic or OpenAI directly, add `ANTHROPIC_API_KEY=...` or `OPENAI_API_KEY=...` instead.
2. **Change `OPENCLAW_GATEWAY_BIND` from `lan` to `loopback`.** This is the one I'd fix on every install. The template sets `lan`, which makes the OpenClaw gateway listen on every interface inside the container. The image's own docs say direct access to the gateway port skips the nginx login. With `loopback`, the gateway only listens inside the container and every request has to go through the login page. The port isn't published to the internet either way, but there's no reason to leave a side door. Do this before the first deploy: the image keeps a bind it has already saved.
3. **Keep the generated password and token.** Don't swap them for something short. Copy the gateway token somewhere safe, because you'll paste it into the Control UI.

## Step 4: Add your domain with HTTPS

The template gives you a free generated domain on port 8080. It works, but it's HTTP only, so your login password would travel in plain text. Use your own domain:

1. At your DNS provider, add an **A record** (for example `claw.yourdomain.com`) pointing to your server's IP. If you use Cloudflare, set it to DNS only (grey cloud) so Let's Encrypt can reach your server.
2. In Dokploy, open the service's **Domains** tab and edit the domain: host `claw.yourdomain.com`, service `openclaw`, port `8080`, turn on **HTTPS**, and pick **Let's Encrypt** as the certificate.

Port 8080 is the nginx login in front of OpenClaw. Only that port gets a domain. Don't add domains or published ports for 18789 (the gateway) or 9222/9223 (the browser).

## Step 5: Deploy and log in

Click **Deploy**. The first start is slow, a few minutes, because the image sets itself up on first boot. When it's up, open `https://claw.yourdomain.com`, log in as `dokploy` with the generated password, and give the Control UI your gateway token when it asks for it.

For Docker Compose services, Dokploy reads domains from Docker labels, so if you change the domain later you have to redeploy.

## Step 6: Lock down the server itself

OpenClaw is now protected. The server around it needs the same care. These come from Dokploy's own security recommendations:

- **Turn on a firewall** that allows only SSH, 80 and 443. Docker writes its own iptables rules and walks straight past UFW, so a port a container publishes stays open even when UFW says deny. Your VPS provider's firewall (Hetzner Firewall, DigitalOcean Cloud Firewall) sits in front of all that, so I prefer it.
- **Use SSH keys** and turn off password login. Fail2Ban is worth installing too.
- **Give Dokploy its own domain with HTTPS**, then close port 3000. Dokploy's docs give the command, and warn you to make sure the domain works first or you'll lock yourself out:

```bash
docker service update --publish-rm "published=3000,target=3000,mode=host" dokploy
```

- **Treat OpenClaw as something that can act for you.** It holds your model key and can drive a browser. Only connect the chat apps and accounts you actually need.

## The easier way: just ask Claude

Everything above is clicking through Dokploy. You can skip learning Dokploy entirely by connecting it to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, then paste Zeqqat's MCP URL into Claude as a connector. After that you say what you want.

Here's what I asked:

> Find the OpenClaw template in Dokploy and check what it would deploy. Don't create anything yet.

Here's what happened, call by call:

1. Claude searched Zeqqat for "template" and found Dokploy's template tools: one to list templates, one to preview a template, and one to deploy it.
2. It listed the templates. My Dokploy has 602. OpenClaw is in there as "Openclaw".
3. It ran the preview, which is read only. Dokploy worked out exactly what the template would create without saving anything:

```
domains: openclaw, port 8080, <generated>.sslip.io
envs:
  OPENCLAW_GATEWAY_TOKEN={{zq_secret_1zxlbft3vwqcnmq3}}
  OPENCLAW_GATEWAY_PORT=18789
  AUTH_USERNAME=dokploy
  AUTH_PASSWORD={{zq_secret_uciz8lq9m29r3fr2}}
  OPENCLAW_BRIDGE_PORT=18790
  OPENCLAW_GATEWAY_BIND=lan
  OPENCLAW_PLUGINS=discord,memory-core
  OPENROUTER_API_KEY={{zq_secret_ptw9qoyu9lh3k8dr}}
```

Two things I liked. The generated password and token never reached Claude: Zeqqat swapped them for `{{zq_secret_...}}` handles before the answer came back, so they aren't sitting in a chat log. And because Claude could see the whole plan, it pointed out `OPENCLAW_GATEWAY_BIND=lan` before anything was running, which is the same fix as Step 3.

One more thing showed up in the template data: the template is listed as version 2026.1.29 but its Compose file pins the image `coollabsio/openclaw:2026.2.6`. Neither matches the newest OpenClaw the image documents. If you want the latest, change the image tag in the Compose file before deploying.

I stopped there. Deploying is one more call, Dokploy's deploy-template tool, and my Zeqqat connection allows it because it creates something new. Delete is switched off on that connection, so Claude can set things up but can't remove anything. Every call carried the same one-line reason, so in Zeqqat's activity log the whole thing shows up as one request I can read back.

## What I took from it

Hosting OpenClaw on a VPS is a template and a few settings in Dokploy. Hosting it securely is mostly three things: HTTPS on your own domain, the gateway bound to loopback so the login can't be skipped, and a firewall that actually applies to Docker. And if you'd rather not learn where all of those live, you can ask your AI to check them for you.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### How much RAM do I need to host OpenClaw on a VPS?

Dokploy needs at least 2 GB of RAM and 30 GB of disk. The OpenClaw template runs OpenClaw plus a Chrome container with 2 GB of shared memory set aside for it, so 4 GB is a more comfortable size. If the model runs through an API like OpenRouter or Anthropic, you don't need a GPU.

### Is it safe to expose OpenClaw to the internet?

Only behind a login and HTTPS. The Dokploy template puts nginx basic auth in front of the web UI and generates a strong password and gateway token. Add your own domain with a Let's Encrypt certificate, set `OPENCLAW_GATEWAY_BIND=loopback`, never publish ports 18789, 9222 or 9223, and use your VPS provider's firewall because Docker bypasses UFW.

### Can I host OpenClaw without Docker?

Yes, OpenClaw can be installed directly, but then you set up the reverse proxy, HTTPS certificates, restarts and updates yourself. With Dokploy the template handles the containers, Traefik handles the domain and certificate, and updating is changing the image tag and redeploying.
