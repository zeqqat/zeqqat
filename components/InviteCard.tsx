// An invitation, on both invite pages (the link's /invite/<token> and the
// one Zeqqat opens itself, /invites/<id>). Only what the person needs to
// decide: who invited them, to which organization, as what, and the MCP URL
// their agent will connect through. What they can do there, they find out
// by doing it.
export function InviteCard({
  organization,
  inviter,
  role,
  url,
  expiresAt,
  children,
}: {
  organization: string;
  inviter: string;
  role: "owner" | "member";
  url: { orgSlug: string; name: string; shortId: string; host: string } | null;
  expiresAt: Date;
  children: React.ReactNode;
}) {
  return (
    <main className="zq-card">
      <div className="zq-requester">
        <span className="zq-avatar" aria-hidden="true" style={{ cursor: "default" }}>
          {inviter.charAt(0).toUpperCase()}
        </span>
        <span className="zq-requester-mark" aria-hidden="true">
          →
        </span>
        <span className="zq-logo" aria-hidden="true">
          {(organization.charAt(0) || "Z").toUpperCase()}
        </span>
      </div>
      <p className="zq-kicker" style={{ marginTop: 18 }}>
        Invitation
      </p>
      <h1 className="zq-card-h" style={{ marginTop: 6 }}>
        Join {organization} on Zeqqat
      </h1>
      <p className="zq-card-p">
        <b style={{ color: "var(--fg)" }}>{inviter}</b> invited you to join {organization} as {role === "owner" ? "an " : "a "}
        <b style={{ color: "var(--fg)" }}>{role === "owner" ? "Owner" : "Member"}</b>.
      </p>
      {url && (
        <div className="zq-invite-via">
          <span className="zq-label" style={{ margin: 0 }}>
            Your agent connects through
          </span>
          <span className="zq-invite-url">
            {url.host}/<b>{url.orgSlug}</b>/mcp/<b>{url.name}</b>/{url.shortId}
          </span>
        </div>
      )}
      {children}
      <p className="zq-fineprint">
        This invite expires on {expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.
      </p>
    </main>
  );
}
