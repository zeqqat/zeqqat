import { copyPolicyAction } from "../lib/actions/policies";
import { handleOf, type getPolicy } from "../lib/policies";
import { getServerSession } from "../lib/session";
import { getUserWorkspace } from "../lib/workspace";
import { PublicHeader } from "./PublicHeader";

type Found = NonNullable<Awaited<ReturnType<typeof getPolicy>>>;

// A public policy's page: what it allows, who wrote it, and a way to copy
// it into your own namespace. A copy is yours; the author's later edits
// only show up as "update available".
export async function PolicyPublic({ found }: { found: Found }) {
  const { row, summary, integrationTitle } = found;
  const session = await getServerSession();
  const ws = session?.user ? await getUserWorkspace(session.user.id) : null;
  const author = await handleOf(row.createdByUserId);
  const canCopy = ws && ws.orgRole === "owner";

  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 860 }}>
        <p className="zq-kicker">
          <a href={`/${summary.namespace}`}>@{summary.namespace}</a> / {integrationTitle} policy
        </p>
        <h1 className="zq-h" style={{ wordBreak: "break-word" }}>
          {row.name}
          <span className="dot">.</span>
        </h1>
        <p className="zq-sub">{row.description || "No description."}</p>

        <section className="zq-block">
          <dl className="zq-kv">
            <dt>Name</dt>
            <dd>
              <code>{summary.canonical}</code>
            </dd>
            <dt>Version</dt>
            <dd>v{row.version}</dd>
            {row.specRelease && (
              <>
                <dt>Written for</dt>
                <dd>
                  {integrationTitle} {row.specRelease}
                </dd>
              </>
            )}
            {author && (
              <>
                <dt>By</dt>
                <dd>{author}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Allows {summary.allow.length} tools
          </h2>
          <p className="zq-note" style={{ marginTop: 0 }}>
            Every tool not listed is denied.
          </p>
          <div className="zq-list">
            {summary.allow.map((n) => (
              <div className="zq-item" key={n}>
                <div className="zq-item-main">
                  <code>{n}</code>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="zq-block">
          {canCopy ? (
            <form action={copyPolicyAction}>
              <input type="hidden" name="policy_id" value={row.id} />
              <button type="submit" className="zq-action zq-action-primary">
                Copy to @{ws.organizationSlug}
              </button>
              <p className="zq-note">The copy is yours. Later changes here won&rsquo;t change it; you&rsquo;ll see an update note.</p>
            </form>
          ) : session?.user ? (
            <p className="zq-note">Switch to a namespace you own to copy this policy.</p>
          ) : (
            <p className="zq-note">
              <a className="zq-textlink" href="/signin">
                Sign in
              </a>{" "}
              to copy this policy into your namespace.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
