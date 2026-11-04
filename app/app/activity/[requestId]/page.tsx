import { notFound } from "next/navigation";
import { CallCard, LookupLine } from "../../../../components/activity/CallCard";
import { BackLink } from "../../../../components/activity/Parts";
import { RequestCard } from "../../../../components/activity/RequestCard";
import { DateBar } from "../../../../components/activity/Time";
import { getRequest } from "../../../../lib/activity";
import { requireWorkspace } from "../../../../lib/guard";

// One request: its card, when it ran, then every call in order. Calls to
// an app are cards; the agent's lookups are quiet lines between them.
export default async function RequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { user, ws } = await requireWorkspace();
  const { requestId } = await params;
  const found = await getRequest({ userId: user.id, ws }, requestId);
  if (!found) notFound();
  const { card, calls } = found;
  const running = calls.some((c) => c.state === "running");

  return (
    <div className="zq-act-page">
      <BackLink href="/app/activity">Activity</BackLink>
      <div className="zq-act-sheet">
        <RequestCard card={card} linked={false} heading />
        <DateBar start={card.startedAt} end={calls[calls.length - 1].at} running={running} />
        {calls.map((c) =>
          c.lookup ? <LookupLine key={c.id} call={c} /> : <CallCard key={c.id} call={c} href={`/app/activity/call/${c.id}`} />,
        )}
      </div>
    </div>
  );
}
