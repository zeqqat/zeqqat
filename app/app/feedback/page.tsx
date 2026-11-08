import { reviewSuggestionAction } from "../../../lib/actions/feedback";
import { reviewableOrgIds, suggestionsFor } from "../../../lib/feedback";
import { requireUser } from "../../../lib/guard";

// Summary suggestions agents sent through zeqqat_feedback, for the tools
// of integrations this person's orgs publish. Accepting one makes it the
// tool's summary for everyone using that integration (lib/feedback.ts).
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const orgIds = await reviewableOrgIds(user.id);
  const [pending, accepted] = await Promise.all([suggestionsFor(orgIds, "pending"), suggestionsFor(orgIds, "accepted", 20)]);

  return (
    <div>
      <p className="zq-kicker">Feedback</p>
      <h1 className="zq-h">
        Better tool summaries<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        Agents suggest these after a summary made a tool hard to find. Accept one and every agent using that integration sees
        it. Nothing changes until you do.
      </p>

      {params.done && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          {params.done === "accepted" ? "Accepted. The tool's summary is updated." : "Rejected."}
        </div>
      )}
      {params.error === "gone" && (
        <p className="zq-note" role="alert">
          That suggestion was already reviewed, or isn&rsquo;t yours to review.
        </p>
      )}

      <div className="zq-block">
        {orgIds.length === 0 ? (
          <p className="zq-empty">Suggestions go to the owners of the account that publishes an integration. You don&rsquo;t publish any yet.</p>
        ) : pending.length === 0 ? (
          <p className="zq-empty">No suggestions waiting.</p>
        ) : (
          <div className="zq-list">
            {pending.map((s) => (
              <div className="zq-item" key={s.id}>
                <div className="zq-item-main">
                  <div className="zq-item-t">
                    <code>{s.operationId}</code> <span className="zq-note">· {s.integration} · from @{s.from}</span>
                  </div>
                  <div className="zq-item-s">Now: {s.liveSummary ?? "no summary"}</div>
                  <div className="zq-item-s">
                    <strong>Suggested: {s.suggestedSummary}</strong>
                  </div>
                  {s.note && <div className="zq-item-s">Why: {s.note}</div>}
                </div>
                <form action={reviewSuggestionAction} className="zq-item-r zq-row-actions">
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" name="decision" value="rejected" className="zq-action">
                    Reject
                  </button>
                  <button type="submit" name="decision" value="accepted" className="zq-action zq-action-primary">
                    Accept
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {accepted.length > 0 && (
        <div className="zq-block">
          <p className="zq-note" style={{ marginTop: 0, marginBottom: 12 }}>
            Recently accepted
          </p>
          <div className="zq-list">
            {accepted.map((s) => (
              <div className="zq-item" key={s.id}>
                <div className="zq-item-main">
                  <div className="zq-item-t">
                    <code>{s.operationId}</code> <span className="zq-note">· {s.integration}</span>
                  </div>
                  <div className="zq-item-s">{s.suggestedSummary}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
