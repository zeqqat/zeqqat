import { RequestCard } from "../../../components/activity/RequestCard";
import { listRequests } from "../../../lib/activity";
import { activityFilterLabel, parseActivityFilter } from "../../../lib/activity-format";
import { requireWorkspace } from "../../../lib/guard";
import { startOfToday } from "../../../lib/overview";

// ?person=<username> narrows to one person's requests. ?when=today and
// ?show=blocked|redacted are what the overview tiles open, so the list
// here is exactly what the tile counted.
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; when?: string; show?: string }>;
}) {
  const { user, ws } = await requireWorkspace();
  const params = await searchParams;
  const person = params.person || undefined;
  const filter = parseActivityFilter(params);
  const filterLabel = activityFilterLabel(filter);

  const cards = await listRequests(
    { userId: user.id, ws },
    {
      limit: 100,
      personUsername: person,
      since: filter.today ? startOfToday() : undefined,
      show: filter.show,
    },
  );

  return (
    <div>
      <div className="zq-act-head">
        <h1 className="zq-h">
          Activity<span className="dot">.</span>
        </h1>
        {person && (
          <span className="zq-act-filter">
            Only @{person}&rsquo;s requests · <a href="/app/activity">Show everyone</a>
          </span>
        )}
        {!person && filterLabel && (
          <span className="zq-act-filter">
            {filterLabel} · <a href="/app/activity">Show all</a>
          </span>
        )}
      </div>
      {cards.length === 0 ? (
        <p className="zq-empty">
          {person
            ? "No requests from this person yet."
            : filter.show === "blocked"
              ? "Nothing was blocked today."
              : filter.show === "redacted"
                ? "No secrets were redacted today."
                : filter.today
                  ? "No requests yet today."
                  : "Activity starts with the first thing someone asks their agent to do."}
        </p>
      ) : (
        <div className="zq-act-list">
          {cards.map((c) => (
            <RequestCard key={c.id} card={c} linked />
          ))}
        </div>
      )}
    </div>
  );
}
