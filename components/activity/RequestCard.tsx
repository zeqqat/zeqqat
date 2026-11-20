import type { RequestCard as Card } from "../../lib/activity";
import { publicUrl } from "../../lib/env";
import { AgentMark, agentName } from "../Marks";
import { Avatar, Strip, Tally } from "./Parts";
import { Pills } from "./Pills";
import { RequestMenu } from "./RequestMenu";
import { RelTime } from "./Time";

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

// One request: who asked, what they asked for, which agent did it, and one
// mark per call. On the list the whole card opens the request's page; on
// that page it is the heading.
// `base` is the workspace the card is shown in (/<username>/<workspace>).
export function RequestCard({ card, linked, heading, base }: { card: Card; linked: boolean; heading?: boolean; base: string }) {
  const cardHref = base + card.href;
  const p = card.person;
  const firstName = p?.name.split(" ")[0] ?? null;

  const views = [
    card.connections.length > 0 && {
      label: plural(card.connections.length, "View MCP URL", "View MCP URLs"),
      count: card.connections.length,
      href: card.connections.length === 1 ? `${base}/mcp-urls/${card.connections[0].id}` : `${base}/mcp-urls`,
    },
    card.integrations.length > 0 && {
      label: plural(card.integrations.length, "View integration", "View integrations"),
      count: card.integrations.length,
      href: `${base}/dokploy-instances`,
    },
    card.instances.length > 0 && {
      label: plural(card.instances.length, "View instance", "View instances"),
      count: card.instances.length,
      href: card.instances.length === 1 ? `${base}/dokploy-instances/${card.instances[0].id}` : `${base}/dokploy-instances`,
    },
  ].filter(Boolean) as { label: string; count: number; href: string }[];

  const review = card.blocked
    ? {
        label: `Review ${card.blocked.op}${card.blocked.instanceAlias ? ` on ${card.blocked.instanceAlias}` : ""}`,
        href: card.blocked.connectionId ? `${base}/mcp-urls/${card.blocked.connectionId}` : `${base}/mcp-urls`,
      }
    : null;

  let shareUrl: string | null = null;
  try {
    shareUrl = new URL(cardHref, publicUrl()).toString();
  } catch {
    shareUrl = null;
  }

  const Req = heading ? "h1" : "p";

  return (
    <div className={`zq-rc${linked ? " is-link" : ""}`}>
      {linked && <a className="zq-rc-link" href={cardHref} aria-label={`Open: ${card.reason}`} />}
      <Avatar person={p} />
      <div className="zq-rc-body">
        <div className="zq-rc-top">
          <b>{p?.name ?? "Public MCP URL"}</b>
          {p?.username && <span className="zq-rc-handle">@{p.username}</span>}
          <span className="zq-rc-sep">·</span>
          <RelTime iso={card.lastAt} />
          <RequestMenu
            views={views}
            review={review}
            shareUrl={shareUrl}
            exportHref={card.legacy ? null : `${base}/activity/${card.id}/export`}
            personHref={p?.username ? `${base}/activity?person=${encodeURIComponent(p.username)}` : null}
            personName={firstName}
          />
        </div>
        <Req className={`zq-rc-req${card.legacy ? " is-legacy" : ""}`}>{card.reason}</Req>
        {card.note && <p className={`zq-rc-note is-${card.note.tone}`}>{card.note.text}</p>}
        <div className="zq-rc-foot">
          <span className="zq-rc-via">
            via <AgentMark host={card.agent.host} size={13} />
            <b>{agentName(card.agent.host)}</b>
          </span>
          <Strip states={card.states} />
          <Tally states={card.states} lookups={card.lookups} />
        </div>
        <Pills
          instances={card.instances.map((i) => ({
            key: i.id,
            label: i.alias,
            calls: i.calls,
            href: `${base}/dokploy-instances/${i.id}`,
          }))}
          urls={card.connections.map((c) => ({
            key: c.id,
            label: c.shortId ? `${c.name}/${c.shortId}` : c.name,
            calls: c.calls,
            href: `${base}/mcp-urls/${c.id}`,
          }))}
        />
      </div>
    </div>
  );
}
