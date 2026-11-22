---
title: "Nginx Proxy Manager vs Dokploy: Domains and SSL for Your Containers"
seoTitle: "Nginx Proxy Manager vs Dokploy (2026): Domains and SSL for Docker Containers"
description: "Nginx Proxy Manager puts your containers on domains with SSL, but you still run and wire every app by hand. Here's how it compares to Dokploy, which does domains, Let's Encrypt and deploys in one place, and how to move over."
date: "2026-11-22"
keywords: "nginx proxy manager, nginx proxy manager alternative, nginx proxy manager vs dokploy, nginx proxy manager docker compose, nginx proxy manager ssl, nginx proxy manager lets encrypt, nginx proxy manager vs traefik, reverse proxy docker ssl, dokploy domains, dokploy traefik"
---

Nginx Proxy Manager is how a lot of people put their first containers on a real domain with SSL. You run it next to your apps, open its admin page, add a proxy host, click "Request a new SSL certificate", and it works. I used it the same way. What I use now is **Dokploy**, which has the same thing built in: every app gets a **Domains** tab where you type the host, tick HTTPS, pick Let's Encrypt, and you're done. The difference is that Dokploy also deploys the app, so there's no second tool to keep in sync.

Below is what each one does, when Nginx Proxy Manager is still the right pick, and how to move your proxy hosts into Dokploy step by step. At the end I show the easier way, where I asked Claude to check every domain on my Dokploy for me.

## What Nginx Proxy Manager does

Nginx Proxy Manager (NPM) is a web interface on top of Nginx. It's open source (MIT) and very popular. You run it as one container:

```yaml
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'   # public HTTP
      - '443:443' # public HTTPS
      - '81:81'   # admin page
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Then you open port 81 in a browser and add:

- **Proxy hosts**: `cloud.yourdomain.com` goes to a container or IP and port.
- **SSL certificates** from Let's Encrypt, or your own.
- **Redirection hosts**, **streams** (raw TCP or UDP ports) and **404 hosts**.
- **Access lists** and basic auth in front of a host.

That's all it does, and it does it well. What it doesn't do is run your apps. Every app is a separate `docker run` or Compose file you start yourself, on a network NPM can reach, and then you go back to NPM and point a host at it. Two tools, two places to update.

## Nginx Proxy Manager vs Dokploy at a glance

| | Nginx Proxy Manager | Dokploy |
|---|---|---|
| What it is | Reverse proxy with a web UI | Self-hosted platform: apps, Compose stacks, databases, templates |
| Proxy under the hood | Nginx | Traefik |
| Let's Encrypt SSL | Yes, per proxy host | Yes, per domain (auto-renewed by Traefik) |
| Deploys your app | No | Yes, from Git, a Docker image or a Compose file |
| Redirects | Redirection hosts | Redirect rules on an application |
| Basic auth | Access lists | Basic auth on an application |
| Raw TCP/UDP ports | Streams | Publish the port on the app |
| Proxy to another machine on your network | Yes, type any IP | Yes, with a small Traefik file in Dokploy |
| Wildcard certificates | Yes, DNS challenge in the UI | Possible, but needs Traefik DNS challenge config by hand |
| Ports it needs | 80, 443, 81 | 80, 443, 3000 |

**Keep Nginx Proxy Manager if** your apps are spread across several machines on a home network (a NAS, a Home Assistant box, a Raspberry Pi) and you just need one front door with SSL. Typing an IP and port is what NPM is best at, and its wildcard certificate setup is easier.

**Switch to Dokploy if** your apps run on one VPS (or a few) and you're tired of starting a container in one place and wiring it up in another. In Dokploy, adding the domain is part of deploying the app.

## Can I run Nginx Proxy Manager and Dokploy together?

Not on the same ports. Both want 80 and 443, because that's where web traffic arrives. Dokploy runs its own Traefik there, and you can't change that without breaking its domains and certificates. So pick one per server. If you're moving, the easy path is a fresh VPS for Dokploy, then move one app at a time and switch its DNS record when it's ready.

## What you need

- **A VPS.** Dokploy asks for at least 2 GB of RAM and 30 GB of disk. Ubuntu or Debian. Hetzner, DigitalOcean, Hostinger and others all work.
- **Ports 80, 443 and 3000 free.**
- **A domain** you can add DNS records to.

## Step 1: Install Dokploy

SSH into the server and run:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Open `http://your-server-ip:3000` and create your admin account.

## Step 2: Write down your proxy hosts

In Nginx Proxy Manager, go through **Hosts** and note for each one:

1. The domain name.
2. Where it forwards to: which container and which port.
3. Whether it has SSL, a redirect, or an access list.

Also note the Compose file or `docker run` command for each app, and its environment variables.

## Step 3: Deploy the app in Dokploy

1. Create a project.
2. Click **Create Service** and pick what you have:
   - **Application** for a Git repo or a Docker image.
   - **Compose** for a Compose file. Choose **Raw** to paste it, or point it at a Git repo.
   - **Template** to search Dokploy's ready-made apps first. Most things people put behind NPM (Nextcloud, Vaultwarden, Uptime Kuma, Immich) are there.
3. Paste variables into the **Environment** tab and click **Deploy**.

You can delete the `ports:` lines for web services in your Compose file. Traefik reaches them over Dokploy's own Docker network, so they don't need a port on the host.

## Step 4: Add the domain with SSL (this replaces the proxy host)

1. Open the service's **Domains** tab and click **Add Domain**.
2. **Host**: `cloud.yourdomain.com`.
3. **Path**: `/`.
4. **Container Port**: the port the app listens on inside the container, for example `3000`. This is the "Forward Port" you had in NPM.
5. For a Compose service, also pick the **service name** from your Compose file.
6. Turn on **HTTPS** and choose **Let's Encrypt** as the certificate.
7. At your DNS provider, add an A record for the host pointing to the server's IP. On Cloudflare, keep it **DNS only** (grey cloud) so Let's Encrypt can reach the server.
8. Redeploy. The certificate usually shows up within a minute. If it doesn't, check the DNS record first.

When HTTPS is on, Dokploy also redirects plain HTTP to HTTPS for you. That's the "Force SSL" switch from NPM, without a switch.

### The rest of your NPM settings

- **Redirects**: an application has redirect rules (a regex and a replacement), for example `www` to the bare domain.
- **Access lists**: an application can have basic auth with a username and password.
- **Streams**: publish the port on the application, the same way you would with `ports:` in Docker.
- **A host on another machine**: Dokploy's Traefik reads extra config files, so you can write a small Traefik router that forwards a domain to an IP on your network. It's more typing than NPM's form, but it works.

## Step 5: Switch over

Move the app's data (volumes or a database dump), deploy it in Dokploy, add the domain, then change the DNS record to the new server. Once everything answers, stop the old containers and Nginx Proxy Manager. Keep the old server a few days before you delete anything.

## The easier way: just ask Claude

Everything above means learning where Dokploy keeps things. You can skip most of that by connecting Dokploy to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, paste Zeqqat's MCP URL into Claude as a connector, and then you just say what you want.

The thing I always lost track of in NPM was which hosts actually had a certificate. So I asked the same about my Dokploy:

> I used to run Nginx Proxy Manager. Show me what in my Dokploy plays that role: every domain, whether it has HTTPS, and which certificate it uses. Don't change anything.

Here's what happened:

1. Claude searched Zeqqat for "domains" and found Dokploy's domain tools. There's no single "list all domains" call, so it listed my projects first, then asked each app and Compose service for its domains. All read only.
2. It found **10 domains on 9 services**, plus one app with no domain at all.
3. It grouped them:

```
Let's Encrypt, HTTPS on         6
No certificate, plain HTTP      3   (two are free sslip.io test hostnames)
HTTPS on, certificate "None"    1
```

The last one is the kind of thing I'd never spot by clicking around. HTTPS with certificate "None" means Traefik isn't getting a certificate for it, so it only works if something in front, like Cloudflare's proxy, handles HTTPS. Claude pointed it out and told me to check that domain's DNS before assuming it's fine. One of the plain HTTP ones is on a real domain too, so that's on my list.

Then I asked it to show me what Dokploy actually builds for one domain, since that's the part NPM used to hide. It read the generated Traefik config (I've swapped my hostname for an example):

```yaml
http:
  routers:
    my-app-router-3:
      rule: Host(`app.example.com`)
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    my-app-router-websecure-3:
      rule: Host(`app.example.com`)
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    my-app-service-3:
      loadBalancer:
        servers:
          - url: http://my-app:3000
```

That's the whole proxy host: one router on port 80 that redirects to HTTPS, one on 443 with a Let's Encrypt certificate, both forwarding to the container on port 3000. Traefik's main config confirmed the rest: `web` on `:80`, `websecure` on `:443`, and Let's Encrypt using the HTTP challenge, which is why the DNS record has to point straight at the server.

Before writing anything, Claude also looked up what adding a domain takes: host, path, container port, the Compose service name, HTTPS on, and the certificate type (`letsencrypt`, `none` or `custom`). So "put Uptime Kuma on status.mydomain.com with HTTPS" is one sentence, not five clicks.

My Zeqqat connection allows reading, creating and editing, but delete is switched off, so Claude can set things up and can't remove anything. Secrets come back as `{{zq_secret_...}}` handles, never the real values. And every call carried the same one-line reason, so the activity log shows the whole check as one request.

## What I took from it

Nginx Proxy Manager is a great first reverse proxy, and if your apps live on different machines at home it's still a good choice. But if your apps run on a VPS, the proxy is only half the job. Dokploy does the other half too: it deploys the app and gives it a domain with HTTPS in the same place. And you don't have to learn Dokploy first if you'd rather ask your AI to do it.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Is Nginx Proxy Manager better than Traefik?

They do the same job differently. Nginx Proxy Manager gives you a web form for each host, which is easier when you start. Traefik is configured with labels or files and finds containers automatically, which is better when apps come and go. Dokploy uses Traefik but gives you a form for each domain, so you get both.

### Can Dokploy replace Nginx Proxy Manager?

For apps you run on your Dokploy server, yes. Each app or Compose service has a Domains tab where you add the host and container port, turn on HTTPS and pick Let's Encrypt. Redirects and basic auth are built in too. For forwarding a domain to another machine on your network, you write a small Traefik config file in Dokploy instead of filling in a form.

### Can I run Nginx Proxy Manager on the same server as Dokploy?

Not on ports 80 and 443. Dokploy's Traefik needs those ports for domains and certificates, and so does Nginx Proxy Manager. Use one per server, or move your apps into Dokploy and let it handle the domains.
