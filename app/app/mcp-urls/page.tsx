import { CreateConnectionForm } from "../../../components/ConnectionForms";
import { McpUrlList, type UrlItem } from "../../../components/McpUrls";
import { listConnections, sunsetState } from "../../../lib/connections";
import { requireWorkspace } from "../../../lib/guard";
import { cutoffLabel, total, urlCounts, usageByUrl } from "../../../lib/mcp-urls";

export default async function McpUrlsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const isAdmin = ws.wsRole === "admin";
  const params = await searchParams;
  const adding = params.add === "1" && isAdmin;

  const conns = await listConnections(ws.workspaceId);
  const ids = conns.map((c) => c.id);
  const [usage, counts] = await Promise.all([usageByUrl(ws.workspaceId, ids), urlCounts(ids)]);

  // Most used this week first; turned-off URLs last.
  const items: UrlItem[] = conns
    .map((c) => {
      const u = usage.get(c.id) ?? { days: Array(30).fill(0), hours: Array(24).fill(0) };
      return {
        id: c.id,
        url: c.url,
        prefix: c.url.slice(0, c.url.length - `${c.name}/${c.shortId}`.length),
        name: c.name,
        shortId: c.shortId,
        isPublic: c.authMode === "public",
        state: sunsetState(c),
        cutoff: c.sunsetAt ? cutoffLabel(c.sunsetAt) : null,
        people: counts.people.get(c.id) ?? 0,
        instances: counts.instances.get(c.id) ?? 0,
        usage: u,
      };
    })
    .sort((a, b) => Number(a.state === "cutoff") - Number(b.state === "cutoff") || total(b.usage, "week") - total(a.usage, "week"));

  return (
    <div>
      <McpUrlList items={items} newHref={isAdmin && !adding ? "/app/mcp-urls?add=1" : null}>
      {params.deleted && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 16 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>MCP URL deleted. It no longer answers, and its short id is never used again.</span>
        </div>
      )}

      {adding && (
        <section className="zq-panel-box" style={{ marginTop: 16 }}>
          <h2 className="zq-block-t" style={{ marginBottom: 14 }}>
            New MCP URL
          </h2>
          <CreateConnectionForm orgSlug={ws.organizationSlug} />
        </section>
      )}

      {items.length === 0 && (
        <p className="zq-empty" style={{ marginTop: 16 }}>
          {isAdmin
            ? "No MCP URLs yet. One is made for you when you add your first instance, or make one now."
            : "No MCP URLs yet. A workspace admin makes them."}
        </p>
      )}
      </McpUrlList>
    </div>
  );
}
