# Submitting to Dokploy

Two separate pull requests, opened once this repository is public and `ghcr.io/zeqqat/zeqqat:0.1.0` is published and public.

## 1. Template (Dokploy/templates)

Copy this folder's `docker-compose.yml`, `template.toml`, `meta.json` and `zeqqat.svg` to `blueprints/zeqqat/` in a fork of https://github.com/Dokploy/templates, then run `node build-scripts/generate-meta.js --check`.

Before asking for review, open the PR's preview link, copy the template's Base64 config, import it into a new Compose service on a Dokploy instance (Advanced, then Import), deploy, and sign in.

When a new version ships, bump the image tag in `docker-compose.yml` and `version` in `meta.json`.

## 2. Goodies (Dokploy/website)

Add one line to the Goodies list (docs/core/goodies) in a fork of https://github.com/Dokploy/website:

```
**Zeqqat**: MCP gateway that gives AI agents scoped, logged access to Dokploy without exposing your API key [Github](https://github.com/zeqqat/zeqqat)
```
