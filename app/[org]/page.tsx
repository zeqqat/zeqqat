import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppFrame } from "../../components/AppFrame";
import { PublicHeader } from "../../components/PublicHeader";
import AccountWorkspacesPage from "./account-home";
import { db } from "../../db";
import { apiEndpoint, integration, organization } from "../../db/schema";
import { listPublicPolicies } from "../../lib/policies";
import { getServerSession } from "../../lib/session";
import { policyPagePath, toCanonical, toolPagePath } from "../../lib/tool-names";
import { isValidOrgSlug } from "../../lib/username";
import { renamedTo } from "../../lib/username-alias";
import { homePathFor, listUserAccounts } from "../../lib/workspace";

type Props = {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await params;
  return { title: `@${org}` };
}

// zeqqat.com/<username> (naming doc v2, section 7), one URL for everyone,
// like a Twitter profile. Someone in the account sees its workspaces (the
// account level of the dashboard). Everyone else, signed in or not, sees
// the public page: what the account publishes. Workspaces never show there.
export default async function OrgPage({ params, searchParams }: Props) {
  const { org: slug } = await params;
  if (!isValidOrgSlug(slug)) notFound();
  const org = await db.query.organization.findFirst({ where: eq(organization.slug, slug) });
  if (!org) {
    // An old username: send the link to the account's current one.
    const renamed = await renamedTo(slug);
    if (renamed) redirect(`/${renamed.slug}`);
    notFound();
  }

  const session0 = await getServerSession();
  if (session0?.user && (await listUserAccounts(session0.user.id)).some((a) => a.organizationId === org.id)) {
    return (
      <AppFrame level="account">
        <AccountWorkspacesPage />
      </AppFrame>
    );
  }

  const q = typeof (await searchParams).q === "string" ? ((await searchParams).q as string).trim().slice(0, 80) : "";
  const like = `%${q}%`;

  const [integrations, tools, session] = await Promise.all([
    db
      .select({
        id: integration.id,
        slug: integration.slug,
        name: integration.name,
        count: sql<number>`count(${apiEndpoint.id}) filter (where ${apiEndpoint.removedAt} is null)::int`,
      })
      .from(integration)
      .leftJoin(apiEndpoint, eq(apiEndpoint.integrationId, integration.id))
      .where(eq(integration.organizationId, org.id))
      .groupBy(integration.id)
      .orderBy(asc(integration.name)),
    db
      .select({
        action: apiEndpoint.action,
        operationId: apiEndpoint.name,
        summary: apiEndpoint.summary,
        kind: apiEndpoint.kind,
        target: integration.slug,
      })
      .from(apiEndpoint)
      .innerJoin(integration, eq(integration.id, apiEndpoint.integrationId))
      .where(
        and(
          eq(integration.organizationId, org.id),
          isNull(apiEndpoint.removedAt),
          q ? or(ilike(apiEndpoint.action, like), ilike(apiEndpoint.summary, like), ilike(apiEndpoint.name, like)) : undefined,
        ),
      )
      .orderBy(asc(integration.slug), asc(apiEndpoint.action))
      .limit(500),
    getServerSession(),
  ]);
  const publicPolicies = await listPublicPolicies(org.id);


  return (
    <div className="zq">
      <PublicHeader right={session?.user ? <a className="zq-link" href={await homePathFor(session.user.id)}>Dashboard</a> : undefined} />
      <main className="zq-body" style={{ maxWidth: 920 }}>
        <p className="zq-kicker">{org.kind === "personal" ? "Person" : "Organization"}</p>
        <h1 className="zq-h">
          {org.displayName}
          <span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          <code>@{org.slug}</code> · {integrations.length === 0 ? "Publishes no tools yet." : `Publishes ${integrations.reduce((n, i) => n + i.count, 0)} tools.`}
        </p>

        {publicPolicies.length > 0 && (
          <section className="zq-block">
            <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
              Policies
            </h2>
            <div className="zq-list">
              {publicPolicies.map((p) => (
                <a className="zq-item" key={p.id} href={policyPagePath(org.slug, p.integrationSlug, p.name)}>
                  <div className="zq-item-main">
                    <div className="zq-item-t">
                      <code>{p.canonical}</code> <span className="zq-badge">v{p.version}</span>
                    </div>
                    <div className="zq-item-s">
                      {p.allow.length} tools{p.description ? ` · ${p.description}` : ""}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {integrations.length > 0 && (
          <section className="zq-block">
            <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
              Integrations
            </h2>
            <dl className="zq-kv">
              {integrations.map((i) => (
                <div key={i.id} style={{ display: "contents" }}>
                  <dt>{i.name}</dt>
                  <dd>
                    <code>{i.slug}</code> · {i.count} {i.count === 1 ? "tool" : "tools"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {integrations.length > 0 && (
          <section className="zq-block">
            <div className="zq-head-row" style={{ alignItems: "center" }}>
              <h2 className="zq-block-t">Tools</h2>
              <form method="get" style={{ display: "flex", gap: 8 }}>
                <input className="zq-input" name="q" defaultValue={q} placeholder="Search tools" aria-label="Search tools" />
              </form>
            </div>
            {tools.length === 0 ? (
              <p className="zq-empty">No tools match &ldquo;{q}&rdquo;.</p>
            ) : (
              <div className="zq-list" style={{ marginTop: 12 }}>
                {tools.map((t) => {
                  const parts = { org: org.slug, target: t.target, type: "http" as const, action: t.action };
                  return (
                    <a className="zq-item" key={`${t.target}.${t.action}`} href={toolPagePath(parts)}>
                      <div className="zq-item-main">
                        <div className="zq-item-t">
                          <code>{toCanonical(parts)}</code> <span className="zq-badge">{t.kind}</span>
                        </div>
                        <div className="zq-item-s">{t.summary ?? t.operationId}</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
