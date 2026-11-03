---
title: "Why Container Logs Disappear in Dokploy (and How to Keep Them)"
seoTitle: Dokploy "No logs found": Why Container Logs Disappear and How to Fix It
description: What Dokploy's "No logs found" message really means, the known causes, how to get your logs back right now, and how to keep logs from filling your disk or vanishing for good.
date: "2026-11-03"
keywords: "dokploy no logs found, dokploy logs disappear, dokploy container logs, docker log rotation, dokploy logs not showing"
---

You open an app's logs in Dokploy and get **"No logs found"**, even though the app is clearly running and the logs were there yesterday. It's one of the longest-running threads in the [Dokploy support forum](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1508546481580146738): reported first in May 2026 and still being confirmed on v0.30.7 in late September.

The good news: in that thread, nobody actually lost logs. They were all still visible with `docker logs` on the server. What disappears is Dokploy's view of them. This post explains what the message really means, how to get your logs back now, and how to keep them safe in the long run.

## What "No logs found" actually means

We read Dokploy's source to see what happens when you open the logs tab. The flow is short:

1. The browser opens a WebSocket to Dokploy at `/docker-container-logs`.
2. Dokploy runs `docker container logs --timestamps --tail <lines> --follow <container>` on the right server, or `docker service logs --raw` for a Swarm service, and streams the output back ([docker-container-logs.ts](https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/wss/docker-container-logs.ts)).
3. If **no data arrives within 2 seconds**, or the WebSocket errors or closes, the page stops loading and shows "No logs found" ([docker-logs-id.tsx](https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/components/dashboard/docker/logs/docker-logs-id.tsx)).

So "No logs found" doesn't mean your logs were deleted. It means **nothing came back over the connection**. That can be a broken WebSocket, a refused connection, or a command that didn't answer in time. Any of those produce the same message.

## Get your logs back right now

Work through these in order. The first few take seconds.

### 1. Refresh the page

It sounds too simple, but one member of the thread reported the logs coming back after a browser refresh. A stale WebSocket is the cheapest thing to rule out.

### 2. Read the logs on the server

Confirm the logs exist, using the same command Dokploy runs:

```bash
# Find the container or service
docker ps --format '{{.Names}}' | grep <appName>
docker service ls | grep <appName>

# Read the last 100 lines
docker logs --tail 100 <container>
docker service logs --raw --tail 100 <service>
```

If these print your logs, the logs are fine and the problem is between Dokploy and your browser.

### 3. Check the browser console

Open your browser's developer tools and reload the logs tab. Look for errors on a WebSocket to `/docker-container-logs`. A failed or closed WebSocket points to the network path, not to Docker.

### 4. If you're behind Cloudflare or a firewall

In [Dokploy issue #4202](https://github.com/Dokploy/dokploy/issues/4202), logs and monitoring stayed blank because the server's firewall was missing some of Cloudflare's IP ranges, which broke the WebSocket. If you only allow Cloudflare to reach your server, make sure your list matches [Cloudflare's published ranges](https://www.cloudflare.com/ips/) and check your Cloudflare WAF rules. Our guide to [running Dokploy behind Cloudflare](/blog/dokploy-behind-cloudflare) covers the rest of that setup.

### 5. Try a different browser

The same issue thread identified a real bug: Safari and Firefox can open WebSockets over HTTP/2, which the newer Traefik versions bundled with Dokploy didn't handle, while Chrome uses HTTP/1.1 and works. The maintainer closed #4202 in favour of the older tracking issue #2570. If Chrome shows logs and Safari doesn't, that's your cause.

A workaround discussed in the issue is to stop Traefik from accepting concurrent HTTP/2 streams on port 443, in `traefik.yml`:

```yaml
entryPoints:
  websecure:
    address: :443
    http2:
      maxConcurrentStreams: 0
```

This is a per-install change, and other users objected to it as a default because it affects every request. Treat it as a workaround, and switching browsers as the safer first step.

### 6. Restart or redeploy the app

The person who opened the Discord thread found that restarting the container brings logs back for about 24 to 48 hours. In late July, Dokploy's maintainer said in the thread that the team was aware of the issue and that it was "more related to permissions." As of late October it was still being reported, so for now a restart is a stopgap rather than a fix.

## Keeping logs: the part nobody sets up

There's a second, quieter problem behind all of this. By default, Docker keeps container logs forever.

Docker's [json-file driver docs](https://docs.docker.com/engine/logging/drivers/json-file/) state that `max-size` defaults to unlimited. We checked Dokploy's source and found no log rotation settings, so unless you've configured Docker yourself, every app's log file grows until the disk fills. A chatty app on a small VPS can get there surprisingly fast.

### Turn on rotation

Add this to `/etc/docker/daemon.json` (create it if it doesn't exist):

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Then restart Docker with `sudo systemctl restart docker`. Each container now keeps at most three 10 MB files.

Two things to know first:

- **It only applies to new containers.** Docker's docs are explicit about this. Redeploy each app in Dokploy so its container is recreated with the new settings.
- **Restarting Docker restarts everything on the server.** Do it in a quiet moment.

### Ship logs somewhere if you need history

Rotation protects your disk, but it also means old lines are gone for good. If you need to look back weeks later, or search across apps, send logs to a separate system.

Dokploy doesn't forward logs to external services yet. There's a related feature request ([#3132](https://github.com/Dokploy/dokploy/issues/3132)), and a [community discussion](https://github.com/Dokploy/dokploy/discussions/3694) shows one person's workaround that forwards every container's logs to an external platform. Docker itself supports [other logging drivers](https://docs.docker.com/engine/logging/configure/), such as syslog or fluentd, that send logs off the server as they're written.

Once logs live somewhere else, a blank Dokploy logs tab becomes an inconvenience instead of an outage in your visibility.

## Summary

| Symptom | Likely cause | First thing to try |
|---|---|---|
| Blank once, fine after refresh | Stale WebSocket | Refresh the page |
| Blank in Safari or Firefox only | WebSockets over HTTP/2 through Traefik | Use Chrome, or the Traefik workaround |
| Blank behind Cloudflare, monitoring blank too | Firewall missing Cloudflare IP ranges | Update your allowlist |
| Blank after a day or two, back after restart | Known open issue | Restart the app, read logs with `docker logs` |
| Disk filling up | No log rotation | Set `max-size` and `max-file` in daemon.json |

## FAQ

### Are my logs deleted when Dokploy shows "No logs found"?

Usually not. In the long Dokploy support thread on this issue, the logs were still available with docker logs on the server. The message means nothing reached the browser within two seconds.

### How do I see container logs without the Dokploy UI?

SSH into the server and run docker logs --tail 100 followed by the container name, or docker service logs --raw --tail 100 followed by the service name for a Swarm service.

### Does Dokploy rotate Docker logs?

Not by default. Docker keeps json-file logs without a size limit unless you set max-size and max-file in /etc/docker/daemon.json, and the setting only applies to containers created afterwards.

### Can Dokploy send logs to an external service?

Not built in yet. There is a related feature request on GitHub. Until then, a Docker logging driver or a log shipper running on the server can forward logs elsewhere.

## Sources

- [Dokploy Discord: Container logs disappear after some time](https://discord.com/channels/1234073262418563112/1369780516806725764/threads/1508546481580146738)
- [Dokploy source: container logs WebSocket](https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/server/wss/docker-container-logs.ts)
- [Dokploy source: logs viewer component](https://github.com/Dokploy/dokploy/blob/canary/apps/dokploy/components/dashboard/docker/logs/docker-logs-id.tsx)
- [Dokploy issue #4202: WebSocket connections fail for logs and monitoring](https://github.com/Dokploy/dokploy/issues/4202)
- [Dokploy issue #3132: log forwarding request](https://github.com/Dokploy/dokploy/issues/3132)
- [Dokploy discussion #3694: forwarding logs to an external service](https://github.com/Dokploy/dokploy/discussions/3694)
- [Docker docs: JSON File logging driver](https://docs.docker.com/engine/logging/drivers/json-file/)
- [Docker docs: Configure logging drivers](https://docs.docker.com/engine/logging/configure/)
- [Cloudflare IP ranges](https://www.cloudflare.com/ips/)
