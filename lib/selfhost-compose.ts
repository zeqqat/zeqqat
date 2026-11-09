// The Docker Compose file a Dokploy install of Zeqqat runs. One copy, used
// twice: the self-host page's one-button install sends it to the user's
// Dokploy, and deploy/dokploy/docker-compose.yml (the Dokploy template) must
// match it exactly (tests/unit/selfhost-compose.test.ts checks).
//
// The image follows "latest" and is pulled on every deploy, so a template
// install never goes stale and Redeploy in Dokploy is the update button.
export const SELFHOST_COMPOSE = `services:
  zeqqat:
    image: ghcr.io/zeqqat/zeqqat:\${ZEQQAT_VERSION:-latest}
    # Pull on every deploy, so redeploying picks up a new "latest" instead of
    # reusing an older image Docker already has.
    pull_policy: always
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      ZEQQAT_PUBLIC_URL: \${ZEQQAT_PUBLIC_URL:?set ZEQQAT_PUBLIC_URL}
      ZEQQAT_EDITION: self-hosted
      DATABASE_URL: postgresql://zeqqat:\${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}@postgres:5432/zeqqat
      BETTER_AUTH_SECRET: \${BETTER_AUTH_SECRET:?set BETTER_AUTH_SECRET}
      ZEQQAT_ENCRYPTION_KEY: \${ZEQQAT_ENCRYPTION_KEY:?set ZEQQAT_ENCRYPTION_KEY}
      ENABLED_AUTH_PROVIDERS: \${ENABLED_AUTH_PROVIDERS:-password}
      GITHUB_CLIENT_ID: \${GITHUB_CLIENT_ID:-}
      GITHUB_CLIENT_SECRET: \${GITHUB_CLIENT_SECRET:-}
      GOOGLE_CLIENT_ID: \${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: \${GOOGLE_CLIENT_SECRET:-}
      MAIL_FROM: \${MAIL_FROM:-}
      RESEND_API_KEY: \${RESEND_API_KEY:-}
      SMTP_URL: \${SMTP_URL:-}
      # Anonymous install ping (README, "Anonymous install ping"). 0 turns it off.
      ZEQQAT_TELEMETRY: \${ZEQQAT_TELEMETRY:-1}
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: zeqqat
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_DB: zeqqat
    volumes:
      - zeqqat-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U zeqqat -d zeqqat"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  zeqqat-postgres:
`;
