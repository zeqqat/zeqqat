# Submitting to Dokploy

Two separate pull requests. The template one is already merged (Nov 2026, pinned to 0.1.0); the next PR replaces it with this folder.

## 1. Template (Dokploy/templates)

Copy this folder's `docker-compose.yml`, `template.toml`, `meta.json` and `zeqqat.svg` to `blueprints/zeqqat/` in a fork of https://github.com/Dokploy/templates, then run `node build-scripts/generate-meta.js --check`.

Before asking for review, open the PR's preview link, copy the template's Base64 config, import it into a new Compose service on a Dokploy instance (Advanced, then Import), deploy, and sign in.

The template follows `latest` (`meta.json` says `"version": "latest"`, as 218 of Dokploy's templates do, and the image is pulled on every deploy), so a new Zeqqat version needs no PR: new installs get it, and Redeploy updates existing ones. Only open a PR when this folder itself changes. `docker-compose.yml` is generated from `lib/selfhost-compose.ts`, which the one-button install also uses; a unit test keeps them identical.

## 2. Goodies (Dokploy/website)

Add one line to the Goodies list (docs/core/goodies) in a fork of https://github.com/Dokploy/website:

```
**Zeqqat**: MCP gateway that gives AI agents scoped, logged access to Dokploy without exposing your API key [Github](https://github.com/zeqqat/zeqqat)
```
