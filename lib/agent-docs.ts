import { sql } from "drizzle-orm";
import { db } from "../db";
import { publicUrl } from "./env";

// The docs zeqqat_docs searches: short sections written for agents.
// The tool descriptions carry everything a normal task needs; these are
// for the less common questions (why was a call denied, what is a
// connection, how does the user add an integration). Each section is
// ranked with Postgres full-text search, so no extension and no index
// table are needed at this size. The same sections are the public pages at
// /docs/agents/<page>, so every passage carries a link a person can open.

export type DocSection = { id: string; page: string; title: string; text: string };

// Public docs pages, in order. Each groups the sections with that `page`.
// `description` is the page's line in search results.
export const DOC_PAGES: { id: string; title: string; description: string }[] = [
  {
    id: "overview",
    title: "How Zeqqat works",
    description:
      "How an AI agent reaches your Dokploy through Zeqqat: one connection URL, eleven built-in tools, and the context every result carries.",
  },
  {
    id: "tools",
    title: "Using the tools",
    description:
      "How an agent finds, describes and runs a Dokploy tool through Zeqqat, and why every call needs a one-line reason.",
  },
  {
    id: "permissions",
    title: "Permissions and policies",
    description:
      "How Zeqqat decides what an agent may do on your Dokploy: read, create, edit and delete, set per tool by a policy, and why a call was denied.",
  },
  {
    id: "integrations",
    title: "Integrations and instances",
    description:
      "What integrations and instances are in Zeqqat: Dokploy is the integration, and each Dokploy server you add is an instance.",
  },
  {
    id: "connections",
    title: "Connections",
    description:
      "How a Zeqqat connection gives one agent its own URL, its own Dokploy servers and its own permissions, and when it ends.",
  },
  {
    id: "secrets",
    title: "Working with secrets",
    description:
      "How Zeqqat keeps API keys, env vars and passwords away from the LLM: agents see handles, pass them back, and create new secrets unseen.",
  },
  {
    id: "errors",
    title: "Errors",
    description: "The errors an agent can get from Zeqqat, what each one means, and what to tell the person it is working for.",
  },
];

export const AGENT_DOCS: DocSection[] = [
  {
    id: "overview",
    page: "overview",
    title: "How Zeqqat works",
    text:
      "Zeqqat is an MCP gateway. One connection URL gives an agent access to the integrations (tool sets such as Dokploy) a person connected, on the instances (servers) they added. " +
      "The agent sees eleven built-in tools: zeqqat_import adds an app from a link to its OpenAPI spec, zeqqat_search finds tools, zeqqat_describe shows one tool's inputs and outputs, zeqqat_run calls a tool on one instance, zeqqat_whoami returns the context, zeqqat_policy shows what is allowed on each instance, zeqqat_secret creates a random secret you never see, zeqqat_docs answers questions about Zeqqat, zeqqat_feedback suggests a better summary for a tool, zeqqat_check tests from the internet whether an address loads or a Dokploy server's port (22, 80, 443, 3000) is open, zeqqat_activity reads the activity log (what agents did, what was blocked). " +
      "Normal flow: search for a task (for example deploy), describe the tool you picked, then run it with the operationId, the instance name from the context, and inputs matching the tool's input schema. " +
      "Search, describe and run each need a reason: one line saying what the user asked you to do. Use exactly the same wording on every call you make for one request; Zeqqat groups those calls together in the activity log people use to audit the connection. A call without a reason is refused.",
  },
  {
    id: "feedback",
    page: "overview",
    title: "Improving tool summaries",
    text:
      "zeqqat_search matches each word of a query on its own, against a tool's operationId, summary, path and tags, plus keywords learned from earlier searches: when a search missed a tool and the agent then ran it in the same request, the search's plain words are recorded, and once two requests used a word it finds that tool. " +
      "When a summary made a tool hard to find or pick, call zeqqat_feedback after the task with the operationId and the one-line summary you would have wanted (10 to 120 characters, plain text). The integration's publisher reviews it; nothing changes until they accept, and then everyone using that integration gets it.",
  },
  {
    id: "context",
    page: "overview",
    title: "The context object",
    text:
      "Every tool result starts with a context object: account (the account that owns this connection), workspace, connection name, the integrations this connection reaches with their instances, and a notice. " +
      "account has a username and a type: personal (one person, the only owner) or organization (owned by a group with owners). It is the owner of the connection, not necessarily the person calling. " +
      "Each integration is named @author/slug, which tells you whose tool set it is, and carries toolCount, how many tools it has. zeqqat_whoami also lists its categories, the kinds of tools it has (for example application, docker, project); search a category to see its tools. zeqqat_whoami also carries zeqqat: the version of Zeqqat answering, the latest release, and updateAvailable, so you can tell the user when their install is behind. " +
      "Instance names are chosen by the user, for example prod or staging. " +
      "An integration that is not listed is not connected: tell the user, they can add it in the Zeqqat dashboard.",
  },
  {
    id: "run",
    page: "tools",
    title: "Running a tool",
    text:
      "Call zeqqat_run with name (the operationId from search, for example application.deploy), instance (an instance name from the context) and inputs. " +
      "The instance decides which integration's tool runs, so the operationId is enough. The full canonical name @author/integration.http.action also works. " +
      "If a required input is missing, the call fails and lists what is missing. Use zeqqat_describe to see the input schema first.",
  },
  {
    id: "permissions",
    page: "permissions",
    title: "Why a call was denied",
    text:
      "Each instance on a connection either has a policy attached or allows tools by kind (read, create, edit, delete). " +
      "With a policy, only the tools on its allow list can run; everything else is denied, including tools a later spec adds. Without one, the connection allows whole kinds. " +
      "On top of either, the caller's role limits by kind: admin can do everything, member cannot delete, viewer can only read. Public connections are always read only. " +
      "Each instance's policySummary in the context says what is allowed; zeqqat_policy returns the full allow list; zeqqat_search marks each tool with allowedOn, the instances it can run on. " +
      "A denied call was not sent. Tell the user; a workspace admin can change it in Connections. Policies are edited in Policies by the account's owner: the one owner of a personal account, or an owner of an organization.",
  },
  {
    id: "policies",
    page: "permissions",
    title: "What a policy is",
    text:
      "A policy is an explicit list of tools (operationIds) an agent may run. It is owned by an account and written for one integration, so its name reads @username/integration.policy.name, for example @gaita/dokploy.policy.read_plus_deploy. " +
      "It is attached to an instance inside a connection, one policy per instance. It works on any instance whose integration has the same spec, whoever imported it. " +
      "Policies can be public: anyone can copy one into their own account. A copy is theirs and never changes when the original does; they get an update note instead. " +
      "A policy records the spec release it was written for; when the spec changes, the dashboard warns the owner to review it.",
  },
  {
    id: "instances",
    page: "integrations",
    title: "Integrations and instances",
    text:
      "An integration is a tool set imported from an API spec, owned by an account, for example @zeqqat/dokploy. An instance is one server of that integration with its own credentials, named by the user. " +
      "Each instance uses exactly one tool set, chosen by a person when the instance is added, so an agent never picks whose tools run against a server. " +
      "If an instance name is not found, check the instance names in the context; the user adds instances in the dashboard under Integrations.",
  },
  {
    id: "connections",
    page: "connections",
    title: "Connections and sunsets",
    text:
      "A connection is one MCP URL, zeqqat.com/<username>/mcp/<name>/<id>, belonging to one workspace. It decides which instances an agent can reach and what it may do on each. " +
      "A connection can be replaced. During the warning period every result carries a notice with the new URL and the cutoff date; tell the user to switch. After the cutoff the connection lists no tools. " +
      "When a workspace moves from a personal account to an organization, its connections get new URLs. The old URL keeps working and every result carries a notice with the new one; tell the user to update the connector.",
  },
  {
    id: "errors",
    page: "errors",
    title: "Common errors",
    text:
      "No instance called X: the instance name is wrong; use one from the context. " +
      "No tool called X: search again, or the tool is not part of this instance's integration. " +
      "Ambiguous tool name: two integrations share the operationId; pass the instance or the canonical name. " +
      "HTTP errors from the instance are passed through with the status code; secrets in responses are removed before you see them.",
  },
  {
    id: "secret-handles",
    page: "secrets",
    title: "Secret handles",
    text:
      "You never see secrets through Zeqqat. When a result contains one (a database password, an API token, an env var such as DATABASE_URL), it arrives as a handle like {{zq_secret_ab12cd34ef56gh78}} instead of the value. " +
      "To use the secret, put the handle in a later zeqqat_run input, alone or inside a string, and Zeqqat fills in the real value just before the request goes out. For example, to copy a database URL into an app: env set to DATABASE_URL=postgresql://app:{{zq_secret_...}}@db:5432/app. " +
      "Never ask the user to paste a secret into the chat; use a handle. Handles expire after 30 minutes; read the value again for a fresh one.",
  },
  {
    id: "new-secrets",
    page: "secrets",
    title: "Creating new secrets",
    text:
      "When a task needs a new password or key (a database password, a session secret, an encryption key), call zeqqat_secret. It returns a handle for a fresh random value. kind password gives letters and digits (length in characters, default 32); kind base64 or hex gives random bytes (base64 with length 32 is a typical signing key). " +
      "Use the same handle everywhere the same value is needed, for example as databasePassword in postgres.create and inside DATABASE_URL in the app's env. The value is stored only where you write it; Zeqqat deletes its copy when the handle expires.",
  },
  {
    id: "secret-rules",
    page: "secrets",
    title: "Where handles work",
    text:
      "A handle only resolves in fields meant for secrets: an env block (env, previewEnv, buildArgs, buildSecrets) or a field whose name says it holds a secret (password, token, key, secret). Anywhere else, such as a webhook URL, a notification target or a description, the call is refused. " +
      "A handle works only on the connection it came from, and on one instance: the one its value came from, or for a zeqqat_secret handle, the first instance it is used on. An unknown or expired handle is refused with nothing sent. When handles were filled in, the result starts with \"Filled in N secrets before sending\", so you know the app got the real values.",
  },
];

export type DocPassage = { title: string; page: string; section: string; text: string; url: string };

export function docUrl(page: string, section?: string): string {
  return `${publicUrl()}/docs/agents/${page}${section ? `#${section}` : ""}`;
}

function toPassage(s: DocSection): DocPassage {
  return { title: s.title, page: s.page, section: s.id, text: s.text, url: docUrl(s.page, s.id) };
}

export function sectionsOf(page: string): DocSection[] {
  return AGENT_DOCS.filter((s) => s.page === page);
}

export function docsIndex(): { title: string; section: string }[] {
  return AGENT_DOCS.map((s) => ({ title: s.title, section: s.id }));
}

// The best few sections for a question, ranked by Postgres full-text
// search over title and text. The sections travel as one jsonb parameter.
// websearch_to_tsquery ANDs every word, which a natural question rarely
// satisfies, so its terms are ORed and ts_rank decides the order.
export async function searchDocs(question: string, limit = 3): Promise<DocPassage[]> {
  const docs = AGENT_DOCS.map((s) => `${s.title}. ${s.text}`);
  const result = await db.execute<{ idx: string }>(sql`
    select d.idx
    from jsonb_array_elements_text(${JSON.stringify(docs)}::jsonb) with ordinality as d(body, idx)
    cross join lateral (
      select replace(websearch_to_tsquery('english', ${question})::text, ' & ', ' | ')::tsquery as query
    ) t
    where to_tsvector('english', d.body) @@ t.query
    order by ts_rank(to_tsvector('english', d.body), t.query) desc, d.idx
    limit ${limit}
  `);
  return result.rows.map((r) => toPassage(AGENT_DOCS[Number(r.idx) - 1])).filter(Boolean);
}

export function docSection(id: string): DocPassage | null {
  const s = AGENT_DOCS.find((d) => d.id === id);
  return s ? toPassage(s) : null;
}
