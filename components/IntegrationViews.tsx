import { CountHead } from "./AccountPages";
import { here } from "../lib/guard";
import { CrumbLast } from "./AppShell";
import { IntegrationVersion, KindPills, ToolFinder, IntegrationsWhat } from "./Integrations";
import { DokployMark } from "./Marks";
import { normalizeBaseUrl } from "../lib/dokploy-check";
import { reviewableOrgIds } from "../lib/feedback";
import {
  compareVersions,
  integrationById,
  integrationCards,
  integrationInstances,
  integrationTools,
  KINDS,
  type InstanceCompare,
  type IntegrationCard,
  type Kind,
} from "../lib/integrations";

// Shared by the workspace pages (/<username>/<workspace>/dokploy-integrations)
// and the account pages (/<username>/dokploy-integrations): the same cards and the same
// integration page, with the instances of the workspaces in scope.

function newest(versions: (string | null)[]): string | null {
  let best: string | null = null;
  for (const v of versions) if (v && (best === null || (compareVersions(v, best) ?? 0) > 0)) best = v;
  return best;
}

// A newer Dokploy among the instances in view, for the publisher's version line.
function newerThan(release: string | null, instances: InstanceCompare[]): string | null {
  const v = newest(instances.map((i) => i.version));
  return v && (compareVersions(v, release) ?? 0) > 0 ? v : null;
}

function Head({ card, href, newer }: { card: IntegrationCard; href?: string; newer: string | null }) {
  const inner = (
    <>
      <span className="zq-in-mark">
        <DokployMark size={24} />
      </span>
      <span className="zq-in-x">
        <span className="zq-in-l1">
          <span className="zq-in-name">
            @{card.orgSlug}/{card.slug}
          </span>
          <span className="zq-in-sp" />
          <IntegrationVersion release={card.release} newer={newer} />
        </span>
        <span className="zq-in-meta">{card.toolCount} tools</span>
      </span>
      <span className="zq-in-kp">
        <KindPills kinds={card.kinds} />
      </span>
    </>
  );
  return href ? (
    <a className="zq-in-head" href={href}>
      {inner}
    </a>
  ) : (
    <div className="zq-in-head">{inner}</div>
  );
}

export async function IntegrationList({
  userId,
  ids,
  base,
  workspaceIds,
  empty,
  account,
  what = false,
}: {
  what?: boolean;
  userId: string;
  ids: string[];
  base: string;
  workspaceIds: string[];
  empty: string;
  account?: { slug: string };
}) {
  // The current workspace's pages, for links to its Dokploy Instances.
  const wsHome = await here();
  const [cards, mine] = await Promise.all([integrationCards(ids), reviewableOrgIds(userId)]);
  const instances = new Map(await Promise.all(cards.map(async (c) => [c.id, await integrationInstances(c.id, workspaceIds)] as const)));
  return (
    <div>
      {account && (
        // No "Add integration": everyone uses @zeqqat/dokploy for now.
        <CountHead n={cards.length} one="integration" many="integrations">
          {null}
        </CountHead>
      )}
      {cards.length > 0 && <IntegrationsWhat open={what} />}
      {cards.length === 0 && !account ? (
        <p className="zq-empty">{empty}</p>
      ) : (
        cards.map((c) => (
          <div className="zq-in-card" key={c.id}>
            <Head card={c} href={`${base}/${c.id}`} newer={mine.includes(c.orgId) ? newerThan(c.release, instances.get(c.id) ?? []) : null} />
          </div>
        ))
      )}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function compareLine(i: InstanceCompare, release: string | null, publisher: string) {
  const c = compareVersions(i.version, release);
  const rel = c === 1 ? "is newer than" : c === -1 ? "is older than" : c === 0 ? "is the same version as" : null;
  const extra = i.extra?.length ?? 0;
  const missing = i.missing?.length ?? 0;
  if (i.extra && extra === 0 && missing === 0) {
    return c === 0 ? <>Same Dokploy version as the integration ({release}), so the same tools</> : <>Same tools as the integration</>;
  }
  return (
    <>
      {rel && i.version && release ? `This Dokploy (${i.version}) ${rel} the integration (${release}).` : null}
      {extra > 0 && (
        <>
          {" "}
          It has <span className="zq-in-u">{plural(extra, "tool", "tools")}</span> the integration doesn&rsquo;t.{" "}
          {extra === 1 ? "It stays" : "They stay"} off until @{publisher} reviews {extra === 1 ? "it" : "them"}.
        </>
      )}
      {missing > 0 && (
        <>
          {" "}
          <span className="zq-in-u">{plural(missing, "tool", "tools")}</span> in the integration {missing === 1 ? "isn't" : "aren't"} on this
          Dokploy.
        </>
      )}
    </>
  );
}

type Tab = "tools" | "instances" | "about" | "new";

export async function IntegrationDetail({
  userId,
  integrationId,
  workspaceIds,
  base,
  params,
}: {
  userId: string;
  integrationId: string;
  workspaceIds: string[];
  base: string;
  params: Record<string, string | string[] | undefined>;
}) {
  // The current workspace's pages, for links to its Dokploy Instances.
  const wsHome = await here();
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const q = one("q").trim().slice(0, 80);
  const kinds = one("kinds")
    .split(",")
    .filter((k): k is Kind => (KINDS as readonly string[]).includes(k));
  const [integ, [card], instances, mine] = await Promise.all([
    integrationById(integrationId),
    integrationCards([integrationId]),
    integrationInstances(integrationId, workspaceIds),
    reviewableOrgIds(userId),
  ]);
  if (!integ || !card) return null;
  const publisher = mine.includes(integ.orgId);
  const tabParam = one("tab");
  const tab: Tab = tabParam === "instances" || tabParam === "about" || (tabParam === "new" && publisher) ? tabParam : "tools";
  const tools = tab === "tools" ? await integrationTools(integrationId, q, kinds) : null;

  // Tools the publisher's own Dokploys serve that the integration doesn't have yet.
  const newOps = new Map<string, { method: string; on: string[] }>();
  if (publisher) {
    for (const i of instances) for (const o of i.extra ?? []) {
      const e = newOps.get(o.name) ?? { method: o.method, on: [] };
      e.on.push(i.alias);
      newOps.set(o.name, e);
    }
  }
  const newFrom = newest(instances.filter((i) => (i.extra?.length ?? 0) > 0).map((i) => i.version));

  const tabs: [Tab, string][] = [
    ["tools", "Tools"],
    ["instances", "Instances"],
    ["about", "About"],
  ];
  const created = integ.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="zq-in-card">
      <CrumbLast text={`@${card.orgSlug}/${card.slug}`} />
      <Head card={card} newer={publisher ? newerThan(card.release, instances) : null} />
      {newOps.size > 0 && (
        <div className="zq-in-note">
          <span>
            <span className="zq-in-u">{plural(newOps.size, "new tool", "new tools")}</span>
            {newFrom ? ` from Dokploy ${newFrom}` : ""} {newOps.size === 1 ? "is" : "are"} here, not activated. Review{" "}
            {newOps.size === 1 ? "it" : "them"} first
          </span>
          <a href={`${base}/${integrationId}?tab=new`}>Review ›</a>
        </div>
      )}
      <nav className="zq-mu-tabs zq-in-tabs" aria-label="Integration">
        {tabs.map(([t, label]) => (
          <a key={t} href={`?tab=${t}`} className={`zq-mu-tab${tab === t ? " is-on" : ""}`} aria-current={tab === t ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>

      {tab === "tools" && tools && (
        <ToolFinder rows={tools.rows} total={tools.total} counts={card.kinds} publisher={publisher} publisherSlug={card.orgSlug} />
      )}

      {tab === "instances" &&
        (instances.length === 0 ? (
          <div className="zq-in-none">No Dokploy instance uses this integration here.</div>
        ) : (
          instances.map((i) => (
            <div className="zq-in-inst" key={i.id}>
              <span className="zq-in-imk">
                <DokployMark size={18} />
              </span>
              <span className="zq-in-ihd">
                <span className="zq-in-l1">
                  <b>{i.alias}</b>
                  <span className="zq-in-sp" />
                  {i.version && <span className="zq-vp">{i.version}</span>}
                </span>
                <span className="zq-in-is">{i.workspaceName}</span>
              </span>
              <span className="zq-in-cmp">
                {compareLine(i, card.release, card.orgSlug)}
                {(i.missing?.length ?? 0) > 0 && (compareVersions(i.version, card.release) ?? 0) < 0 && (
                  <span className="zq-in-act">
                    <a className="zq-action zq-action-sm" href={`${wsHome}/dokploy-instances/${i.id}?tab=manage`}>
                      Update Dokploy
                    </a>
                  </span>
                )}
                <a className="zq-in-spec" href={`${normalizeBaseUrl(i.baseUrl) ?? i.baseUrl}/api/settings.getOpenApiDocument`} target="_blank" rel="noopener noreferrer">
                  This Dokploy&rsquo;s API spec ↗
                </a>
              </span>
            </div>
          ))
        ))}

      {tab === "new" &&
        [...newOps.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, o]) => (
            <div className="zq-in-new" key={name}>
              <span className="zq-in-x">
                <code>{name}</code>
                <small>
                  {o.method} · on {o.on.join(", ")}
                </small>
              </span>
              <span className="zq-mu-pill is-on" style={{ ["--k" as string]: "var(--faint)" }}>
                Not activated
              </span>
            </div>
          ))}

      {tab === "about" && (
        <>
          <div className="zq-mu-mrow">
            <div className="zq-ip-added">
              <span className="zq-ip-added-l">Published by</span>
              <span className="zq-ip-addedby">
                <span className="zq-mu-av zq-ip-added-av zq-in-orgav" style={{ background: "#2e6fe0" }} aria-hidden="true">
                  {(integ.orgName || integ.orgSlug).trim()[0]?.toUpperCase()}
                </span>
                <span className="zq-ip-addedby-t">
                  <span className="zq-mu-pn">
                    <b>{integ.orgName || integ.orgSlug}</b> <span>@{integ.orgSlug}</span>
                  </span>
                  <span className="zq-ip-added-d">{created}</span>
                </span>
              </span>
            </div>
          </div>
          <div className="zq-mu-mrow">
            <div className="zq-mu-mrow-h">
              <span className="zq-mu-mrow-t">
                <b>Built from</b>
                <small>
                  <a className="zq-in-spec" style={{ margin: 0 }} href={`${base}/${integrationId}/spec`} target="_blank" rel="noopener noreferrer">
                    {card.release ? `Dokploy ${card.release}'s API spec` : "The API spec"} ↗
                  </a>
                </small>
              </span>
            </div>
          </div>
          {!publisher && (
            <div className="zq-mu-mrow">
              <div className="zq-mu-mrow-h">
                <span className="zq-mu-mrow-t">
                  <b>Something wrong?</b>
                  <small>A wrong description or kind goes to @{integ.orgSlug} to review</small>
                </span>
                <a className="zq-action zq-action-sm zq-mu-mbtn" href="?tab=tools">
                  Suggest a fix
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
