import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CopyButton } from "../../../components/CopyButton";
import { PublicHeader } from "../../../components/PublicHeader";
import { db } from "../../../db";
import { organization } from "../../../db/schema";
import { endpointNames, findToolByPage } from "../../../lib/catalog";
import { PolicyPublic } from "../../../components/PolicyPublic";
import { findPolicyByPage } from "../../../lib/policies";
import { parseDotted, parsePolicyDotted } from "../../../lib/tool-names";
import { isValidOrgSlug } from "../../../lib/username";

type Props = { params: Promise<{ org: string; tool: string }> };

function decode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, tool } = await params;
  const pol = parsePolicyDotted(decode(tool));
  if (pol) return { title: `@${org}/${pol.integrationSlug}.policy.${pol.name}` };
  const d = parseDotted(decode(tool));
  return { title: d ? `@${org}/${d.target}.${d.type}.${d.action}` : "Tool" };
}

// zeqqat.com/<org>/<target.type.action> (naming doc v2, section 7). The
// full dotted name is the URL; tool names always contain two dots, so this
// route can't collide with /<org>/mcp/... or /<org>/c/.... HTTP tools
// aren't versioned in URLs yet: a pinned `@x.y.z` link goes to the latest.
export default async function ToolPage({ params }: Props) {
  const { org: orgSlug, tool } = await params;
  if (!isValidOrgSlug(orgSlug)) notFound();
  // Policies share the URL scheme: /<namespace>/<integration>.policy.<name>.
  const pol = parsePolicyDotted(decode(tool));
  if (pol) {
    const found = await findPolicyByPage(orgSlug, pol.integrationSlug, pol.name);
    if (!found || found.row.visibility !== "public") notFound();
    return <PolicyPublic found={found} />;
  }
  const parsed = parseDotted(decode(tool));
  if (!parsed) notFound();
  if (parsed.pin) redirect(`/${orgSlug}/${parsed.target}.${parsed.type}.${parsed.action}`);
  if (parsed.type !== "http") notFound();

  const org = await db.query.organization.findFirst({ where: eq(organization.slug, orgSlug) });
  if (!org) notFound();
  const t = await findToolByPage(orgSlug, parsed.target, parsed.action);
  if (!t) notFound();
  const names = endpointNames(t, t.orgSlug, t.integrationSlug);

  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 860 }}>
        <p className="zq-kicker">
          <a href={`/${org.slug}`}>@{org.slug}</a> / {t.integrationName}
        </p>
        <h1 className="zq-h" style={{ wordBreak: "break-word" }}>
          {t.action}
          <span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          {t.summary ?? `${t.method} ${t.path}`}
          {t.removedAt ? " This tool was removed from the latest spec and can no longer be run." : ""}
        </p>

        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Names
          </h2>
          <dl className="zq-kv">
            <dt>In Zeqqat</dt>
            <dd>
              <code>{names.canonical}</code>
            </dd>
            <dt>Agents call it as</dt>
            <dd>
              <code>{names.operationId}</code> <CopyButton text={names.operationId} />
            </dd>
          </dl>
          <p className="zq-note">
            Agents find this tool with zeqqat_search and run it with zeqqat_run, passing this operationId and one of your
            instances. The canonical name works too.
          </p>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Details
          </h2>
          <dl className="zq-kv">
            <dt>Publisher</dt>
            <dd>
              <a className="zq-textlink" href={`/${org.slug}`}>
                {org.displayName}
              </a>
            </dd>
            <dt>Integration</dt>
            <dd>{t.integrationName}</dd>
            <dt>Type</dt>
            <dd>http</dd>
            <dt>Request</dt>
            <dd>
              <code>
                {t.method} {t.path}
              </code>
            </dd>
            <dt>Access needed</dt>
            <dd>{t.kind}</dd>
            {t.tags.length > 0 && (
              <>
                <dt>Tags</dt>
                <dd>{t.tags.join(", ")}</dd>
              </>
            )}
          </dl>
          {t.description && <p className="zq-note">{t.description}</p>}
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Input
          </h2>
          <div className="zq-cbox">
            <pre className="zq-cbox-block">{JSON.stringify(t.inputSchema, null, 2)}</pre>
          </div>
        </section>
      </main>
    </div>
  );
}
