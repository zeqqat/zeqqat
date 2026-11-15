// The landing page's example questions, each with a replay: what the agent
// shows and what Zeqqat logs, side by side. Every replay was first run for
// real through Zeqqat on a real Dokploy (2026-11-15, v0.3.74): the same
// tools, in the same order, with the same outcome. Names, ids and log lines
// are swapped for generic ones so no real project shows. The numbers in the
// disk replay are the real ones. Keep it that way: a step goes in only if
// Zeqqat can really do it today (and "blocked" only if the default rules
// really block it).
//
// The Zeqqat side is drawn with the app's own Activity components
// (components/DemoReplay.tsx), so it looks exactly like /app/activity.

// One step the agent takes: a catalog lookup (zeqqat_search), or a call to
// Dokploy through zeqqat_run.
export type ReplayLookup = { search: string };

export type ReplayCall = {
  tool: string; // operationId, as the agent passes it to zeqqat_run
  action: string; // its canonical action, as Activity shows it (@zeqqat/dokploy.http.<action>)
  summary: string; // the catalog's one-line summary (catalog/dokploy/summaries.json)
  kind: "read" | "create" | "edit" | "delete";
  outcome: "ok" | "blocked";
  inputs: Record<string, unknown>;
  ms: number;
  hidden?: number; // secrets replaced by handles in the result
};

export type ReplayStep = ReplayLookup | ReplayCall;

export function isLookup(s: ReplayStep): s is ReplayLookup {
  return "search" in s;
}

export type ReplayTurn = {
  ask: string; // what the person types; also the request's reason in Activity
  steps: ReplayStep[];
  answer: string[]; // the agent's reply, one entry per paragraph; `code` in backticks, "> " starts a log excerpt
};

export type Replay = {
  slug: string;
  ask: string; // exactly as on the landing page; the first turn's ask
  title: string; // for the page's <title>
  turns: ReplayTurn[];
};

// Who asks in every replay.
export const DEMO_PERSON = { name: "Mauricio Doe", username: "mauricio_doe", image: null };
export const DEMO_INSTANCE = "my-dokploy";
export const DEMO_CONNECTION = "claude";

export const REPLAYS: Replay[] = [
  {
    slug: "database",
    ask: "Why can't my app reach its database?",
    title: "Why can't my app reach its database?",
    turns: [
      {
        ask: "Why can't my app reach its database?",
        steps: [
          { search: "project applications databases" },
          {
            tool: "project.all",
            action: "project_all",
            summary: "List every project with its environments and services",
            kind: "read",
            outcome: "ok",
            inputs: {},
            ms: 412,
          },
          {
            tool: "application.one",
            action: "application_one",
            summary: "Get one application's full details, incl. its long deploy history",
            kind: "read",
            outcome: "ok",
            inputs: { applicationId: "kq3Vt8xLm2" },
            ms: 538,
            hidden: 2,
          },
          {
            tool: "postgres.one",
            action: "postgres_one",
            summary: "Get one Postgres database's details by postgresId",
            kind: "read",
            outcome: "ok",
            inputs: { postgresId: "p7Hw2nRc9e" },
            ms: 301,
            hidden: 1,
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
        steps: [
          { search: "read deployment build logs" },
          {
            tool: "application.search",
            action: "application_search",
            summary: "Search applications by name; each result's applicationStatus is the quickest deploy check",
            kind: "read",
            outcome: "ok",
            inputs: { name: "my-app" },
            ms: 288,
          },
          {
            tool: "deployment.all",
            action: "deployment_all",
            summary: "List an application's full deploy history, newest first",
            kind: "read",
            outcome: "ok",
            inputs: { applicationId: "kq3Vt8xLm2" },
            ms: 344,
          },
          {
            tool: "deployment.readLogs",
            action: "deployment_read_logs",
            summary: "Read a deployment's build and deploy log",
            kind: "read",
            outcome: "ok",
            inputs: { deploymentId: "d4Lp0sYv1Q", tail: 100 },
            ms: 627,
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
        steps: [
          { search: "disk usage docker space server" },
          {
            tool: "settings.getDockerDiskUsage",
            action: "settings_get_docker_disk_usage",
            summary: "Get Docker's disk usage: images, containers, volumes and cache",
            kind: "read",
            outcome: "ok",
            inputs: {},
            ms: 1184,
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
        steps: [
          {
            tool: "settings.cleanDockerBuilder",
            action: "settings_clean_docker_builder",
            summary: "Delete Docker's build cache on a server",
            kind: "delete",
            outcome: "blocked",
            inputs: {},
            ms: 3,
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
