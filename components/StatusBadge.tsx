// The last connection test's result for an instance.
export function StatusBadge({ status }: { status: string | null }) {
  if (status === "ok") return <span className="zq-badge zq-badge-ok">Reachable</span>;
  if (status === "bad_key") return <span className="zq-badge zq-badge-warn">Key rejected</span>;
  if (status === "unreachable" || status === "not_dokploy") return <span className="zq-badge zq-badge-warn">Unreachable</span>;
  return <span className="zq-badge">Not checked</span>;
}
