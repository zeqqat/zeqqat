// The landing page's example questions, each with a replay: what the agent
// shows and what Zeqqat logs, side by side. Every replay was first run for
// real through Zeqqat on a real Dokploy (2026-11-15, v0.3.74): the same
// tools, in the same order, with the same outcome. Names, ids and log lines
// are swapped for generic ones so no real project shows. The numbers in the
// disk replay are the real ones. Keep it that way: a step goes in only if
// Zeqqat can really do it today (and "not allowed" only if the default
// rules really block it).

export type ReplayCall = {
  tool: string; // operationId, as the agent passes it to zeqqat_run
  kind: "read" | "create" | "edit" | "delete";
  outcome: "ok" | "blocked";
  hidden?: number; // secrets replaced by handles in the result
  note?: string; // what the agent got back, one short line
};

export type ReplayTurn = {
  ask: string; // what the person types
  calls: ReplayCall[];
  answer: string[]; // the agent's reply, one entry per paragraph; `code` in backticks, "> " starts a log excerpt
};

export type Replay = {
  slug: string;
  ask: string; // exactly as on the landing page; the first turn's ask
  title: string; // for the page's <title>
  turns: ReplayTurn[];
};

export const REPLAYS: Replay[] = [
  {
    slug: "database",
    ask: "Why can't my app reach its database?",
    title: "Why can't my app reach its database?",
    turns: [
      {
        ask: "Why can't my app reach its database?",
        calls: [
          {
            tool: "project.all",
            kind: "read",
            outcome: "ok",
            note: "My App and my-app-db, both in project shop",
          },
          {
            tool: "application.one",
            kind: "read",
            outcome: "ok",
            hidden: 2,
            note: "DATABASE_URL points at host my-app-db",
          },
          {
            tool: "postgres.one",
            kind: "read",
            outcome: "ok",
            hidden: 1,
            note: "running, internal host my-app-db-x7k2pq",
          },
        ],
        answer: [
          "Found it. My App's `DATABASE_URL` uses the host `my-app-db`, but inside Dokploy's network the database is called `my-app-db-x7k2pq` (its app name, not the name you gave it). So the app is looking for a server that doesn't exist.",
          "The database itself is fine: it's running and listening on 5432.",
          "Want me to fix the host in `DATABASE_URL` and redeploy My App? I'll keep the password as it is. I never see it, it shows up for me as a handle.",
        ],
      },
    ],
  },
  {
    slug: "deploy-logs",
    ask: "Show me the logs from my last deploy.",
    title: "Show me the logs from my last deploy",
    turns: [
      {
        ask: "Show me the logs from my last deploy.",
        calls: [
          {
            tool: "application.search",
            kind: "read",
            outcome: "ok",
            note: "My App, last deploy: error",
          },
          {
            tool: "deployment.all",
            kind: "read",
            outcome: "ok",
            note: 'newest: "add checkout page", failed after 52 s',
          },
          {
            tool: "deployment.readLogs",
            kind: "read",
            outcome: "ok",
            note: "last 100 lines of the build log",
          },
        ],
        answer: [
          'Your last deploy of My App ("add checkout page", 12 minutes ago) failed during the build, after 52 seconds. The important lines:',
          "> ./app/checkout/page.tsx\nModule not found: Can't resolve '@/lib/stripe'\n> Build failed because of webpack errors",
          "The new checkout page imports `lib/stripe`, but that file isn't in the commit. Probably not added to git. The previous deploy is still the one serving traffic, so the site is up.",
          "Commit `lib/stripe.ts` and push, and Dokploy will deploy again. Want me to watch it and tell you when it's done?",
        ],
      },
    ],
  },
  {
    slug: "disk",
    ask: "My disk is filling up. What's using it?",
    title: "My disk is filling up. What's using it?",
    turns: [
      {
        ask: "My disk is filling up. What's using it?",
        calls: [
          {
            tool: "settings.getDockerDiskUsage",
            kind: "read",
            outcome: "ok",
            note: "images 8.1 GB, build cache 7.6 GB, volumes 917 MB",
          },
        ],
        answer: [
          "Docker is using about 16.7 GB:",
          "Images: 8.1 GB, all 21 in use. Build cache: 7.6 GB, none of it in use. Volumes: 917 MB, that's your databases' data. Containers: under 1 MB.",
          "The build cache is the easy win: all 7.6 GB can go, and nothing running needs it.",
        ],
      },
      {
        ask: "Clear the build cache.",
        calls: [
          {
            tool: "settings.cleanDockerBuilder",
            kind: "delete",
            outcome: "blocked",
            note: "deletes aren't allowed on this connection",
          },
        ],
        answer: [
          "I can't. Clearing the cache counts as a delete, and deletes aren't allowed on this connection, so Zeqqat stopped the call before it reached Dokploy. Nothing was removed.",
          "If you want me to do it, allow this one tool in Zeqqat and ask again. Or click Clean in Dokploy's Docker settings.",
        ],
      },
    ],
  },
];

export function replayBySlug(slug: string): Replay | undefined {
  return REPLAYS.find((r) => r.slug === slug);
}
