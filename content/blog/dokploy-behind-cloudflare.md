---
title: "Dokploy Behind Cloudflare: Proxy, SSL Modes, Tunnels and Let's Encrypt"
seoTitle: "Dokploy and Cloudflare: SSL Modes, Tunnels, 404s and Let's Encrypt Fixes"
description: "Three Cloudflare setups that work with Dokploy, why mixing them breaks things, and how to fix the usual symptoms: Cloudflare 404s, redirect loops, 526 errors and failed Let's Encrypt renewals."
date: "2026-11-03"
keywords: "dokploy cloudflare, dokploy cloudflare tunnel, dokploy ssl, dokploy lets encrypt, dokploy 404 cloudflare, traefik cloudflare full strict"
---

Most Dokploy and Cloudflare problems come from mixing two setups that each work fine on their own. Cloudflare can sit in front of your server in three ways, and Dokploy's domain settings have to match the one you picked. Get the pair right and certificates, redirects and routing all behave.

This guide covers the three setups, how to choose, and what to check when you see a Cloudflare 404, a redirect loop, a 526 error or a failed Let's Encrypt renewal. It draws on threads in the [Dokploy Discord](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1557141253533999265), Dokploy's own docs and source code, and our own setup: zeqqat.com runs on Dokploy behind Cloudflare.

## How a request reaches your app

Every request takes the same path:

1. The visitor's browser connects to whatever your DNS record points at.
2. If the record is **proxied** (orange cloud), that is Cloudflare. Cloudflare terminates the visitor's TLS connection and opens a second connection to your server.
3. On your server, **Traefik** (the reverse proxy Dokploy installs) receives the request on port 80 or 443.
4. Traefik looks for a **router** whose rule matches the requested hostname and forwards the request to your app's container.

Two details explain most of the problems below:

- **If no Traefik router matches the hostname, Traefik answers 404.** Cloudflare passes that 404 straight through, so it looks like Cloudflare is broken when it is really Traefik saying "I don't know this host."
- **Dokploy's Let's Encrypt certificates use the HTTP-01 challenge on port 80.** You can see this in Dokploy's [Traefik setup code](https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/setup/traefik-setup.ts): the `letsencrypt` resolver uses `httpChallenge` on the `web` entrypoint. Let's Encrypt's [challenge docs](https://letsencrypt.org/docs/challenge-types/) say HTTP-01 only works on port 80, so anything that blocks or hijacks port 80 breaks renewal.

## The three setups that work

| | DNS only (grey cloud) | Proxied (orange cloud) | Cloudflare Tunnel |
|---|---|---|---|
| Who serves the visitor's certificate | Traefik (Let's Encrypt) | Cloudflare | Cloudflare |
| Cloudflare SSL/TLS mode | Not used | Full (strict) | Not needed for the tunnel hop |
| Dokploy domain HTTPS | On | On | Off |
| Dokploy certificate | Let's Encrypt | Let's Encrypt or Cloudflare Origin CA | None |
| Server needs open ports 80/443 | Yes | Yes | No |
| Server IP hidden | No | Yes | Yes |

### Setup 1: DNS only, Let's Encrypt in Dokploy

Point an A record at your server with the proxy **off** (grey cloud). In Dokploy, set the domain's HTTPS to on and the certificate to Let's Encrypt.

This is the simplest setup and the one with the fewest moving parts. Cloudflare is only your DNS host. Traefik gets a certificate over port 80 and renews it automatically every 90 days, as Dokploy's [certificates docs](https://docs.dokploy.com/docs/core/domain/certificates) describe.

The trade-off: your server's IP is public, and you get none of Cloudflare's caching or DDoS protection.

### Setup 2: Proxied with Full (strict)

Turn the proxy **on** (orange cloud) and set Cloudflare's SSL/TLS mode to **Full (strict)**. Dokploy's [Cloudflare guide](https://docs.dokploy.com/docs/core/domains/cloudflare) recommends this, with the domain's HTTPS on and the certificate set to Let's Encrypt.

Full (strict) means Cloudflare encrypts the hop to your server and checks that your server presents a valid certificate. That is why Dokploy still needs a certificate here. You have two choices:

- **Let's Encrypt**, issued by Traefik as in Setup 1. Renewal still depends on port 80 being reachable through Cloudflare.
- **A Cloudflare Origin CA certificate**, created under SSL/TLS, then Origin Server in Cloudflare and added in Dokploy under Certificates. Dokploy's guide notes these can last up to 15 years and avoid failed renewals. They are only trusted by Cloudflare, so they only work while the record stays proxied.

Avoid **Flexible** mode. Cloudflare's [SSL mode docs](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/) explain that Flexible sends traffic from Cloudflare to your server over plain HTTP. If you use it anyway, Dokploy's domain HTTPS must be **off**, or you get a redirect loop (see below).

### Setup 3: Cloudflare Tunnel

A tunnel flips the direction of the connection. A small program, `cloudflared`, runs on your server and dials out to Cloudflare. Cloudflare sends visitor traffic back down that connection. Your server needs no open inbound ports at all, so there is no IP to bypass Cloudflare with.

In the tunnel's route (Cloudflare calls it a published application), point the service at Traefik on the same machine. You have two ways to do it:

- **`http://localhost:80`**, with the Dokploy domain's HTTPS **off** and the certificate set to **None**. Cloudflare serves the visitor's certificate, the hop through the tunnel is already encrypted, and Traefik just routes by hostname. This is how analytics.zeqqat.com is set up.
- **`https://localhost:443`** with **No TLS Verify** turned on. This works, but Cloudflare's [origin parameters docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/) recommend keeping verification on, because turning it off accepts any certificate from the origin.

If you go with the first option, keep HTTPS off in Dokploy. With HTTPS on, Dokploy adds a `redirect-to-https` middleware to the port 80 router (you can see it in [domain.ts](https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/utils/traefik/domain.ts)), and every request through the tunnel gets redirected instead of served.

## Fixing the common symptoms

### A 404 from Cloudflare, but the container is running

This was the busiest recent thread in the Dokploy support forum: an app on a remote server, deployed with no errors, answering with a 404 through Cloudflare. The helpers in the thread pointed out that the 404 almost always comes from Traefik on the server, because no router matches the hostname. Their checklist is the right order to work through:

1. **Reload or redeploy after changing a domain.** Traefik needs to pick up the new rule.
2. **For an Application**, Dokploy doesn't use Docker labels. It writes a Traefik file per app. On the server running the app (the remote server, if you deploy to one), check it:

   ```bash
   grep Host /etc/dokploy/traefik/dynamic/<appName>.yml
   ```

   If the file is missing or still shows an old hostname, open the domain in Dokploy and save it again. That rewrites the file.
3. **For a Docker Compose service**, Dokploy injects domains as labels at deploy time, so changing a domain does nothing until you redeploy. Afterwards, check the labels and confirm the service is on `dokploy-network`:

   ```bash
   docker inspect <container> --format '{{json .Config.Labels}}' | tr ',' '\n' | grep -i rule
   ```

If **every** app on a server returns 404, look at Docker and Traefik versions instead. Docker 29 raised the minimum Docker API version to 1.44, and older Traefik releases fail to talk to it with a "client version is too old" error ([Docker forum thread](https://forums.docker.com/t/docker-29-increased-minimum-api-version-breaks-traefik-reverse-proxy/150384), [Traefik issue #12253](https://github.com/traefik/traefik/issues/12253)). Traefik v3.6.1 moved to the newer API ([write-up](https://blog.melashri.net/micro/docker_api_mismatch/)), and current Dokploy installs a newer Traefik than that. Check what your server runs with `docker ps | grep traefik`.

A quick way to tell the two cases apart: if the browser shows a plain `404 page not found` with no Cloudflare branding, Traefik answered and simply has no router for that host.

### "Too many redirects"

This is Flexible mode plus a server that redirects HTTP to HTTPS. Cloudflare connects over HTTP, your server redirects to HTTPS, Cloudflare connects over HTTP again, and so on. Cloudflare's [redirect loop docs](https://developers.cloudflare.com/ssl/troubleshooting/too-many-redirects/) give two fixes: stop redirecting at the origin, or switch to Full or Full (strict). With Dokploy, the second is usually better: switch to Full (strict) and keep HTTPS on.

### Error 526

Cloudflare's [526 docs](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/) describe this as an invalid certificate at the origin while using Full (strict). On Dokploy it usually means Traefik has no valid certificate for that hostname yet, often because a Let's Encrypt request failed. Fix the renewal (next section) or switch to a Cloudflare Origin CA certificate.

### Let's Encrypt renewal fails

Because Dokploy uses HTTP-01, renewal needs Let's Encrypt to fetch `http://your-domain/.well-known/acme-challenge/<token>` on port 80 and get Traefik's answer. Things that break it:

- **Port 80 closed.** A firewall that only allows 443 blocks the challenge.
- **Something else answers the challenge path.** A recent post in the [Dokploy support forum](https://discord.com/channels/1234073262418563112/1369780516806725764) was titled exactly this: the HTTP-01 challenge answered by the app instead of Traefik. Check for custom routers, middlewares or Cloudflare redirect rules that touch `/.well-known/acme-challenge/`.
- **Redirects that leave ports 80 and 443.** Let's Encrypt follows up to 10 redirects, but only to ports 80 and 443 ([challenge docs](https://letsencrypt.org/docs/challenge-types/)).
- **Hostnames more than one level deep on a proxied record.** On a free Cloudflare plan, Dokploy's guide notes the proxied methods cover first-level subdomains only, so `staging.api.example.com` won't get Cloudflare's edge certificate.

If renewals keep failing on a proxied domain, an Origin CA certificate removes renewals from the picture entirely. On a tunnel, you don't need Let's Encrypt at all.

### Logs and terminals stop loading behind Cloudflare

Dokploy's log viewer and terminal use WebSockets. If your server's firewall only allows Cloudflare's IP ranges, make sure the list is complete and current ([Cloudflare's published ranges](https://www.cloudflare.com/ips/)). A missing range was the cause in [Dokploy issue #4202](https://github.com/Dokploy/dokploy/issues/4202). We cover the rest of that symptom in [Why container logs disappear in Dokploy](/blog/dokploy-container-logs-disappear).

## Which setup should you use?

- **One server, you want the fewest moving parts:** DNS only with Let's Encrypt.
- **You want Cloudflare's caching and protection, and your server has a public IP:** proxied with Full (strict).
- **You don't want any open ports, or your server is behind NAT:** a Cloudflare Tunnel routed to `http://localhost:80`, with HTTPS off in Dokploy.

Whichever you choose, change one layer at a time and reload the app after each change. Most of the threads above started with two settings changed at once.

## FAQ

### Should I use Flexible SSL with Dokploy?

No. Flexible sends traffic between Cloudflare and your server unencrypted, and it causes redirect loops if Dokploy's domain HTTPS is on. Use Full (strict) instead.

### Do I need Let's Encrypt if my domain is proxied through Cloudflare?

With Full (strict), your server still needs a valid certificate. Let's Encrypt works, or you can use a Cloudflare Origin CA certificate, which lasts much longer and needs no renewals.

### Why do I get a 404 from Cloudflare when my Dokploy container is running?

Usually Traefik on your server has no router for that hostname. Reload the app after changing a domain, check the app's Traefik file under /etc/dokploy/traefik/dynamic, or redeploy a Compose service so its labels update.

### Can I use a Cloudflare Tunnel with Dokploy?

Yes. Route the tunnel to Traefik on the same server at http://localhost:80 and turn the domain's HTTPS off in Dokploy. Cloudflare serves the certificate and your server needs no open ports.

### Why does Let's Encrypt renewal fail on my Dokploy server?

Dokploy uses the HTTP-01 challenge, which needs port 80 open and Traefik answering the challenge path. A closed port 80, a redirect rule or another router answering that path will break it.

## Sources

- [Dokploy docs: Cloudflare](https://docs.dokploy.com/docs/core/domains/cloudflare)
- [Dokploy docs: Certificates](https://docs.dokploy.com/docs/core/domain/certificates)
- [Dokploy source: Traefik setup (Let's Encrypt resolver)](https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/setup/traefik-setup.ts)
- [Dokploy source: domain routers and HTTPS redirect](https://github.com/Dokploy/dokploy/blob/canary/packages/server/src/utils/traefik/domain.ts)
- [Dokploy Discord: Remote deploy returning a Cloudflare 404](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1557141253533999265)
- [Dokploy issue #4202: WebSocket logs failing](https://github.com/Dokploy/dokploy/issues/4202)
- [Let's Encrypt: Challenge types](https://letsencrypt.org/docs/challenge-types/)
- [Cloudflare: SSL/TLS encryption modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
- [Cloudflare: Too many redirects](https://developers.cloudflare.com/ssl/troubleshooting/too-many-redirects/)
- [Cloudflare: Error 526](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/)
- [Cloudflare Tunnel: Origin parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/)
- [Cloudflare IP ranges](https://www.cloudflare.com/ips/)
- [Docker forum: Docker 29 breaks Traefik](https://forums.docker.com/t/docker-29-increased-minimum-api-version-breaks-traefik-reverse-proxy/150384)
- [Traefik issue #12253](https://github.com/traefik/traefik/issues/12253)
