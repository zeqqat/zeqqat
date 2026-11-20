import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CrumbLast } from "../../../../../components/AppShell";
import type { InstanceCard } from "../../../../../components/InstanceCards";
import { KeyRow } from "../../../../../components/InstanceManage";
import { Avatar, InstancePage, type Tab } from "../../../../../components/InstancePage";
import { ManageRow } from "../../../../../components/McpUrlPage";
import { db } from "../../../../../db";
import { instance, integration } from "../../../../../db/schema";
import { removeInstanceAction, retestInstanceAction, updateDokployAction } from "../../../../../lib/actions/instances";
import { here, requireWorkspace } from "../../../../../lib/guard";
import { freshDokploy, instanceCounts, usageByInstance } from "../../../../../lib/instance-cards";
import { integrationCards, integrationInstances } from "../../../../../lib/integrations";
import { addedBy, instanceCalls, instancePeople, instanceUrls } from "../../../../../lib/instance-page";
import { changedPart } from "../../../../../lib/version-diff";

// One Dokploy instance's page, designed 2026-11-18 (canvas "Dokploy instance
// page"): the same card as on the list, then MCP URLs, Calls, Connected and
// Manage. The page's client part is components/InstancePage.tsx; Manage is
// drawn here because its rows submit server actions.

const TABS: Tab[] = ["urls", "calls", "connected", "manage"];

// A server component renders once per request, so reading the clock here
// is fine; the client gets this time so "2m ago" matches on both sides.
function requestTime() {
  return Date.now();
}

function Ok({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={warn ? "zq-warn-box" : "zq-ok-box"} role="status" style={{ marginBottom: 14 }}>
      <span className="ic" aria-hidden="true">
        {warn ? "!" : "✓"}
      </span>
      <span>{children}</span>
    </div>
  );
}

function ago(d: Date | null, now: number) {
  if (!d) return "Never";
  const m = Math.round((now - d.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const STATUS_WORD: Record<string, string> = {
  ok: "reachable",
  bad_key: "key rejected",
  unreachable: "unreachable",
  not_dokploy: "not answering as Dokploy",
};

export default async function InstanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const base = await here();
  const { id } = await params;
  const query = await searchParams;
  const { ws } = await requireWorkspace();
  const isOwner = ws.role === "owner";
  const isAdmin = ws.wsRole === "admin";

  const [inst] = await db
    .select({
      id: instance.id,
      alias: instance.alias,
      baseUrl: instance.baseUrl,
      credential: instance.credential,
      lastStatus: instance.lastStatus,
      lastVersion: instance.lastVersion,
      lastValidatedAt: instance.lastValidatedAt,
      specVersion: instance.specVersion,
      specCheckedAt: instance.specCheckedAt,
      createdAt: instance.createdAt,
      createdByUserId: instance.createdByUserId,
      integrationId: instance.integrationId,
      appSlug: integration.slug,
      appName: integration.name,
      appLogo: integration.logoUrl,
    })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .where(and(eq(instance.id, id), eq(instance.workspaceId, ws.workspaceId)))
    .limit(1);
  if (!inst) redirect(`${base}/dokploy-instances`);

  const isDokploy = inst.appSlug === "dokploy";
  const [usage, counts, fresh, urls, calls, owner] = await Promise.all([
    usageByInstance(ws.workspaceId, [inst.id]),
    instanceCounts([inst.id]),
    isDokploy ? freshDokploy([inst]) : Promise.resolve(new Map()),
    instanceUrls(ws.workspaceId, inst.id),
    instanceCalls(ws.workspaceId, inst.id),
    addedBy(inst.createdByUserId),
  ]);
  const [people, [integ], compared] = await Promise.all([
    instancePeople(ws.workspaceId, inst.id, urls),
    integrationCards([inst.integrationId]),
    integrationInstances(inst.integrationId, [ws.workspaceId]),
  ]);
  const mine = compared.find((c) => c.id === inst.id);

  const f = fresh.get(inst.id);
  let host = inst.baseUrl;
  try {
    host = new URL(inst.baseUrl).host;
  } catch {
    // keep the stored address as typed
  }
  const status: string | null = f?.status ?? inst.lastStatus;
  const version: string | null = f?.version ?? inst.lastVersion;
  const latest: string | null = f?.latest ?? null;
  const card: InstanceCard = {
    id: inst.id,
    name: inst.alias,
    host,
    appName: inst.appName,
    appSlug: inst.appSlug,
    appLogo: inst.appLogo,
    status,
    version,
    latest,
    urls: counts.urls.get(inst.id) ?? 0,
    people: counts.people.get(inst.id) ?? 0,
    usage: usage.get(inst.id) ?? { days: Array(30).fill(0), hours: Array(24).fill(0) },
  };

  const now = requestTime();
  const asked = typeof query.tab === "string" ? query.tab : "";
  const initialTab: Tab = (TABS as string[]).includes(asked) ? (asked as Tab) : "urls";
  const err = typeof query.error === "string" ? query.error : "";
  const v = (s: string) => (s.startsWith("v") ? s : `v${s}`);
  const behind = !!version && !!latest && changedPart(version, latest) !== null;

  const manage = (
    <>
      {query.key === "replaced" && <Ok>New key tested and saved. The old one is gone from Zeqqat.</Ok>}
      {query.checked && <Ok>Checked just now.</Ok>}
      {query.updating && (
        <Ok>
          {inst.appName} is updating{latest ? ` to ${v(latest)}` : ""}. It restarts in a minute or two, and agents get errors until it&rsquo;s back.
        </Ok>
      )}
      {err === "update" && (
        <Ok warn>
          {inst.appName} didn&rsquo;t start the update. Check that the key belongs to an admin, or update from {inst.appName} itself.
        </Ok>
      )}
      <div className="zq-mu-panel">
        <div className="zq-mu-mrow">
          <div className="zq-ip-added">
            <span className="zq-ip-added-l">Added by</span>
            <span className="zq-ip-addedby">
              {owner ? <Avatar p={owner} className="zq-mu-av zq-ip-added-av" /> : <span className="zq-mu-av zq-ip-added-av is-more" aria-hidden="true" />}
              <span className="zq-ip-addedby-t">
                <span className="zq-mu-pn">
                  <b>{owner?.name ?? "Someone on your team"}</b> {owner?.username && <span>@{owner.username}</span>}
                </span>
                <span className="zq-ip-added-d">
                  {inst.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                </span>
              </span>
            </span>
          </div>
        </div>

        <div className="zq-mu-mrow">
          <div className="zq-mu-mrow-h">
            <span className="zq-mu-mrow-t">
              <b>{inst.appName} URL</b>
              <small>{inst.baseUrl}</small>
            </span>
          </div>
        </div>

        {integ && (
          <a className="zq-mu-mrow zq-in-mrow" href={`${base}/dokploy-integrations/${integ.id}`}>
            <div className="zq-mu-mrow-h">
              <span className="zq-mu-mrow-t">
                <b>Integration</b>
                <small className="zq-in-l1" style={{ flexWrap: "wrap", gap: 6 }}>
                  @{integ.orgSlug}/{integ.slug}
                  {integ.release && <span className="zq-vp">{integ.release}</span>}
                  <span>· {integ.toolCount} tools</span>
                </small>
                {mine?.extra && (mine.extra.length > 0 || (mine.missing?.length ?? 0) > 0) && (
                  <small>
                    {mine.extra.length > 0 && (
                      <>
                        This Dokploy has <span className="zq-in-u">{mine.extra.length === 1 ? "1 tool" : `${mine.extra.length} tools`}</span> the
                        integration doesn&rsquo;t. {mine.extra.length === 1 ? "It stays" : "They stay"} off until @{integ.orgSlug} reviews{" "}
                        {mine.extra.length === 1 ? "it" : "them"}.{" "}
                      </>
                    )}
                    {(mine.missing?.length ?? 0) > 0 && (
                      <>
                        <span className="zq-in-u">{mine.missing!.length === 1 ? "1 tool" : `${mine.missing!.length} tools`}</span> in the integration{" "}
                        {mine.missing!.length === 1 ? "isn't" : "aren't"} on this Dokploy.
                      </>
                    )}
                  </small>
                )}
              </span>
              <span className="zq-in-go" aria-hidden="true">›</span>
            </div>
          </a>
        )}

        {isDokploy && isOwner && behind ? (
          <ManageRow
            title="Version"
            value={
              <>
                {inst.appName} {v(version!)} · <span className="zq-ip-amber">{v(latest!)} is out</span>
              </>
            }
            button="Update"
            submit={`Update to ${v(latest!)}`}
            formId="ip-update"
          >
            <form action={updateDokployAction} id="ip-update">
              <input type="hidden" name="instance_id" value={inst.id} />
              <p className="zq-ip-note">
                {inst.appName} updates itself to {v(latest!)} and restarts. Agents get errors for a minute or two while it does.
              </p>
            </form>
          </ManageRow>
        ) : (
          <div className="zq-mu-mrow">
            <div className="zq-mu-mrow-h">
              <span className="zq-mu-mrow-t">
                <b>Version</b>
                <small>
                  {version ? `${inst.appName} ${v(version)}` : "Not known yet"}
                  {version && latest && !behind ? " · latest" : ""}
                  {behind ? (
                    <>
                      {" "}
                      · <span className="zq-ip-amber">{v(latest!)} is out</span>
                    </>
                  ) : null}
                </small>
              </span>
            </div>
          </div>
        )}

        <KeyRow instanceId={inst.id} canEdit={isOwner} />

        <div className="zq-mu-mrow">
          <div className="zq-mu-mrow-h">
            <span className="zq-mu-mrow-t">
              <b>Last checked</b>
              <small>
                {ago(inst.lastValidatedAt, now)}
                {status ? ` · ${STATUS_WORD[status] ?? status}` : ""}
              </small>
            </span>
            {isOwner && (
              <form action={retestInstanceAction}>
                <input type="hidden" name="instance_id" value={inst.id} />
                <button type="submit" className="zq-action zq-action-sm zq-mu-mbtn">
                  Check now
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="zq-mu-mrow">
          <div className="zq-mu-mrow-h">
            <span className="zq-mu-mrow-t">
              <b>Secrets</b>
              <small>
                Agents never see them. Env vars, database URLs and tokens in {inst.appName}&rsquo;s answers are swapped for placeholders the agent can pass on but not read
              </small>
            </span>
          </div>
        </div>

        {isOwner && (
          <ManageRow
            title="Remove"
            value="Deletes the key from Zeqqat. Every MCP URL stops reaching it. Past calls stay in Activity"
            button="Remove"
            submit={`Remove ${inst.alias}`}
            formId="ip-remove"
            danger
            open={err === "confirm"}
          >
            <form action={removeInstanceAction} id="ip-remove">
              <input type="hidden" name="instance_id" value={inst.id} />
              <input className="zq-input" name="confirm" placeholder={`Type ${inst.alias} to confirm`} autoComplete="off" aria-label={`Type ${inst.alias} to confirm`} />
              {err === "confirm" && <p className="zq-form-err">Type {inst.alias} to confirm.</p>}
            </form>
          </ManageRow>
        )}
      </div>
    </>
  );

  return (
    <>
      <CrumbLast text={inst.alias} />
      <InstancePage
        card={card}
        urls={urls}
        calls={calls}
        people={people}
        manage={manage}
        initialTab={initialTab}
        addUrlHref={isAdmin ? `${base}/mcp-urls` : null}
        now={now}
      />
    </>
  );
}
