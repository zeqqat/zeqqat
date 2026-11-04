<p align="center">
  <img src="public/zeqqat.svg" width="64" height="64" alt="Zeqqat logo">
</p>

<h1 align="center">Zeqqat</h1>

<p align="center">
  Give AI access to your Dokploy. Minus the risk.
</p>

<p align="center">
  <a href="https://zeqqat.com">Website</a> ·
  <a href="https://zeqqat.com/docs/self-host">Self-host guide</a> ·
  <a href="https://zeqqat.com/blog">Blog</a>
</p>

---

Zeqqat is an open source MCP gateway for [Dokploy](https://dokploy.com). Your agent (Claude, ChatGPT, Cursor, Claude Code or any MCP client) connects to one Zeqqat URL instead of holding your Dokploy API key. Zeqqat decides what it may do, makes the call for it, and records everything.

## Why

Handing an agent your Dokploy API key gives it everything: every server, every env var, and the power to delete. Zeqqat sits in between.

- **Your keys stay out of the model.** API keys are encrypted at rest and never returned to an agent. Responses are scrubbed of secret-shaped values (env vars, tokens, private keys) before the model sees them.
- **Decide what each agent can do.** Allow reading, creating, editing or deleting per connection, or write a policy that allows specific tools only. Anything not allowed is refused.
- **See every call.** Each request is logged with who asked, which agent, the reason it gave, what it called and what came back.
- **Bring your team.** Organizations, workspaces and roles, so teammates get their own access instead of a shared key.
- **The whole Dokploy API.** All 554 Dokploy endpoints, found by search, so your agent's context isn't flooded with tool definitions.

## Self-host on Dokploy

Zeqqat is one container and a Postgres database.

1. In Dokploy, create a **Docker Compose** service from this repository (or paste [`docker-compose.yml`](docker-compose.yml)).
2. Set the environment variables (see below).
3. Add your domain to the `zeqqat` service on port **3000** and deploy.
4. Open your domain, sign in, and connect your Dokploy.

The full walkthrough is at [zeqqat.com/docs/self-host](https://zeqqat.com/docs/self-host).

### Anywhere with Docker

```bash
git clone https://github.com/zeqqat/zeqqat.git
cd zeqqat
cp .env.example .env    # fill in the values
docker compose up -d
```

To reach it locally on `http://localhost:3000`, uncomment the `ports` lines in `docker-compose.yml`.

### Configuration

| Variable | Required | What it is |
| --- | --- | --- |
| `ZEQQAT_PUBLIC_URL` | yes | Your install's URL, for example `https://zeqqat.example.com` |
| `POSTGRES_PASSWORD` | yes | Password for the bundled Postgres |
| `BETTER_AUTH_SECRET` | yes | Session secret: `openssl rand -base64 32` |
| `ZEQQAT_ENCRYPTION_KEY` | yes | Encrypts stored API keys: `openssl rand -base64 32`. Keep it safe, a new key makes stored keys unreadable |
| `ENABLED_AUTH_PROVIDERS` | yes | `github`, `google`, or both, comma separated |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | for GitHub sign-in | From a GitHub OAuth app with callback `<your URL>/api/auth/callback/github` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | From Google Cloud, with redirect URI `<your URL>/api/auth/callback/google` |

Every option is documented in [`.env.example`](.env.example). Database migrations run automatically on startup.

## Connect an agent

After you connect your Dokploy, Zeqqat gives you a connection URL like `https://zeqqat.example.com/you/mcp/deployment/a39f`. Add it to your agent as a remote MCP server and sign in when asked. Your agent gets a few stable tools (`zeqqat_search`, `zeqqat_describe`, `zeqqat_run` and friends) and reaches Dokploy through them.

## Development

You need Node 22, pnpm 9 and Postgres.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm check` runs typecheck, lint and tests. [`AGENTS.md`](AGENTS.md) explains the architecture, and [`CONTRIBUTING.md`](CONTRIBUTING.md) explains how to send changes.

Built with Next.js, Postgres, Drizzle and Better Auth.

## Security

Please report vulnerabilities privately. See [`SECURITY.md`](SECURITY.md).

## License

[Apache License 2.0](LICENSE)
