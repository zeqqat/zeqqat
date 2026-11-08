<div align="center">
  <a href="https://zeqqat.com" target="_blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.svg">
      <img alt="Zeqqat" src=".github/assets/banner-light.svg" width="100%">
    </picture>
  </a>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
    <a href="https://github.com/zeqqat/zeqqat/releases"><img src="https://img.shields.io/github/v/release/zeqqat/zeqqat?include_prereleases" alt="Release"></a>
    <a href="https://github.com/zeqqat/zeqqat/pkgs/container/zeqqat"><img src="https://img.shields.io/badge/ghcr.io-zeqqat%2Fzeqqat-2e6fe0" alt="Docker image"></a>
    <a href="https://github.com/zeqqat/zeqqat/stargazers"><img src="https://img.shields.io/github/stars/zeqqat/zeqqat?style=flat" alt="Stars"></a>
  </p>

  <p><b>Give AI access to your APIs and MCPs. Minus the risk.</b></p>

  <p>
    <a href="https://zeqqat.com">Website</a> ·
    <a href="https://zeqqat.com/docs/self-host">Self-host guide</a> ·
    <a href="https://zeqqat.com/docs/agents">Agent docs</a> ·
    <a href="https://zeqqat.com/blog">Blog</a>
  </p>

  <p><sub>Works with Claude, Claude Code, ChatGPT, Cursor, Gemini and any MCP client.</sub></p>
</div>

<br>

Zeqqat is an open source MCP gateway between AI agents and your APIs. Your agent connects to one Zeqqat URL instead of holding your API keys. Zeqqat decides what it may do, makes the call for it, and records everything. Self-host it on your own Dokploy for free, or use the hosted version at [zeqqat.com](https://zeqqat.com).

## ✨ Features

- **Keys stay out of the model**: API keys are encrypted at rest and never returned to an agent.
- **Scrubbed responses**: env vars, tokens and private keys are stripped from every response before the model sees it.
- **Permissions per connection**: allow reading, creating, editing or deleting, one connection at a time.
- **Policies**: allow exactly the tools you list, and share policies with others.
- **Activity log**: every request shows who asked, which agent, the reason it gave, what it called and what came back.
- **Teams**: organizations, workspaces and roles, so teammates get their own access instead of a shared key.
- **The whole Dokploy API**: all 554 endpoints, found by search, so your agent's context isn't flooded with tool definitions.
- **Any API from its OpenAPI spec**: paste a link to an app's spec (Stripe, GitHub, your own) and every endpoint becomes a tool under your account, with read, create, edit and delete guessed for each. From the dashboard, from your agent with `zeqqat_import`, or with `POST /api/integrations/import`.
- **Standard OAuth sign-in**: agents connect with OAuth 2.1, and each token only works on the connection it was issued for.
- **Self-hosted**: one container and Postgres, with migrations applied on startup.

## 🚀 Getting Started

### On Dokploy

1. Create a **Docker Compose** service from this repository, or paste [`docker-compose.yml`](docker-compose.yml).
2. Set the environment variables listed under Configuration below.
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

### Connect an agent

After you connect your Dokploy, Zeqqat gives you a connection URL like `https://zeqqat.example.com/you/mcp/deployment/a39f`. Add it to your agent as a remote MCP server and sign in when asked. Your agent reaches Dokploy through a few stable tools: `zeqqat_search`, `zeqqat_describe`, `zeqqat_run`, `zeqqat_whoami`, `zeqqat_policy`, `zeqqat_secret`, `zeqqat_import` and `zeqqat_docs`.

## ⚙️ Configuration

| Variable | Required | What it is |
| --- | --- | --- |
| `ZEQQAT_PUBLIC_URL` | yes | Your install's URL, for example `https://zeqqat.example.com` |
| `POSTGRES_PASSWORD` | yes | Password for the bundled Postgres |
| `BETTER_AUTH_SECRET` | yes | Session secret: `openssl rand -base64 32` |
| `ZEQQAT_ENCRYPTION_KEY` | yes | Encrypts stored API keys: `openssl rand -base64 32`. Keep it safe, a new key makes stored keys unreadable |
| `ENABLED_AUTH_PROVIDERS` | yes | Any of `github`, `google` and `email`, comma separated |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | for GitHub sign-in | A GitHub OAuth app with callback `<your URL>/api/auth/callback/github` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | A Google OAuth client with redirect URI `<your URL>/api/auth/callback/google` |
| `MAIL_FROM` plus `SMTP_URL` or `RESEND_API_KEY` | for email sign-in | Sender address, and how to send: any SMTP server (`smtps://user:password@smtp.example.com:465`) or a Resend API key. People sign in with a 6-digit code sent to their email |

Every option is documented in [`.env.example`](.env.example).

### Anonymous install ping

So we can tell how many self-hosted installs exist and which versions they run, a self-hosted install sends one small ping to `https://zeqqat.com/api/telemetry` when it starts and once a day after that. The ping is exactly this, and nothing else:

```json
{ "installId": "a random UUID made on first start", "version": "0.2.1" }
```

No IP address, hostname, users, emails, instances, API keys, connections or tool calls are ever sent, and zeqqat.com doesn't store your IP. The code is in [`lib/telemetry.ts`](lib/telemetry.ts).

To turn it off, set `ZEQQAT_TELEMETRY=0` (`DO_NOT_TRACK=1` works too) and restart.

## ☁️ Cloud vs Self-hosted

| | Zeqqat Cloud | Self-hosted |
| --- | --- | --- |
| Cost | Free while in beta | Free and open source |
| Setup | Sign up at [zeqqat.com](https://zeqqat.com) | One Docker Compose service on your Dokploy |
| Where your keys live | Encrypted on zeqqat.com | Encrypted on your own server |
| Features | Everything | Everything |
| Updates | Automatic | Pull a new image tag |

## 🛠️ Development

You need Node 22, pnpm 9 and Postgres.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm check` runs typecheck, lint and tests. [`AGENTS.md`](AGENTS.md) explains the architecture. Built with Next.js, Postgres, Drizzle and Better Auth.

### Contributors 🤝

<a href="https://github.com/zeqqat/zeqqat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=zeqqat/zeqqat" alt="Contributors">
</a>

## 🤝 Contributing

Read the [Contributing Guide](CONTRIBUTING.md) before opening a pull request.

## 🔒 Security

Please report vulnerabilities privately. See [`SECURITY.md`](SECURITY.md).

## 📄 License

[Apache License 2.0](LICENSE)

---
