import { CountHead } from "./AccountPages";
import { DokployMark } from "./Marks";
import { PolicyName } from "./PolicyClient";
import { KIND_ORDER, type MapRow, type PolicyCardData } from "../lib/policy-pages";

// The Policies pages' shared parts: the policy card (list row and the top of
// a policy's page), the list, and the Map tab.

const LABEL = { read: "Read", create: "Create", edit: "Edit", delete: "Delete" } as const;

export function Shield({ size = 15 }: { size?: number }) {
  return (
    <svg className="zq-pl-shield" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  );
}

function KindRatios({ card }: { card: PolicyCardData }) {
  return (
    <span className="zq-pl-kp">
      {KIND_ORDER.map((k) => (
        <span key={k} className={`zq-mu-pill k-${k}${card.allowed[k] ? " is-on" : ""}`} title={`${LABEL[k]}: ${card.allowed[k]} of ${card.totals[k]}`}>
          <i aria-hidden="true" />
          {LABEL[k]} <b>{card.allowed[k]}</b>
          <span>/{card.totals[k]}</span>
        </span>
      ))}
    </span>
  );
}

function usageWords(c: PolicyCardData) {
  if (c.urls === 0) return "Not used";
  return `${c.urls} MCP URL${c.urls === 1 ? "" : "s"} · ${c.instances} instance${c.instances === 1 ? "" : "s"}`;
}

// One policy: name and version / what it allows, per kind / where it's used.
export function PolicyCardBody({ card, bio }: { card: PolicyCardData; bio?: string | null }) {
  return (
    <>
      <span className="zq-pl-ic">
        <Shield />
      </span>
      <span className="zq-pl-x">
        <span className="zq-pl-l1">
          <PolicyName prefix={card.prefix} name={card.name} />
          <span className="zq-pl-sp" />
          {card.version !== null && <span className="zq-vp">v{card.version}</span>}
        </span>
        <KindRatios card={card} />
        <span className="zq-pl-words">{usageWords(card)}</span>
        {bio && <span className="zq-pl-bio">{bio}</span>}
      </span>
    </>
  );
}

export function PolicyList({ cards, base, newHref, count }: { cards: PolicyCardData[]; base: string; newHref: string | null; count: number }) {
  return (
    <div>
      <div className="zq-pl-head">
        <CountHead n={count} one="policy" many="policies">
          {newHref && (
            <a className="zq-action" href={newHref}>
              + New policy
            </a>
          )}
        </CountHead>
      </div>
      <div className="zq-in-card zq-pl-group">
        {cards.map((c) => (
          <a key={c.id} className={`zq-pl-row${c.id !== "default" && c.urls === 0 ? " is-idle" : ""}`} href={`${base}/${c.id}`}>
            <PolicyCardBody card={c} />
          </a>
        ))}
      </div>
    </div>
  );
}

// MCP URL → (calls this week, through this policy) → instance. One line per
// MCP URL and instance; on a phone the line scrolls sideways.
export function PolicyMapRows({ rows, account }: { rows: MapRow[]; account: string }) {
  if (rows.length === 0) return <div className="zq-in-none">No MCP URL uses this policy yet.</div>;
  return (
    <div className="zq-mv-list">
      {rows.map((r) => (
        <div className="zq-mv-row" key={`${r.connectionId}:${r.instanceId}`}>
          <div className="zq-mv-chain">
            <a className="zq-mv-n" href={`/${account}/${r.connectionWsSlug}/mcp-urls/${r.connectionId}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
                <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
              </svg>
              <code>
                {r.connectionName}/{r.shortId}
              </code>
            </a>
            <span className={`zq-mv-mid${r.calls ? "" : " is-zero"}`}>
              <span className="ln" />
              <span className="c">
                <Shield size={14} />
                {r.calls ? `${r.calls.toLocaleString("en-US")} call${r.calls === 1 ? "" : "s"} this week` : "No calls this week"}
              </span>
              <span className="ln ar" />
            </span>
            <a className="zq-mv-n" href={`/${account}/${r.instanceWsSlug}/dokploy-instances/${r.instanceId}`}>
              <DokployMark size={14} />
              <span>{r.instanceAlias}</span>
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PolicyTabs({ tabs, tab, dot }: { tabs: [string, string][]; tab: string; dot?: string }) {
  return (
    <nav className="zq-mu-tabs zq-in-tabs" aria-label="Policy">
      {tabs.map(([t, label]) => (
        <a key={t} href={`?tab=${t}`} className={`zq-mu-tab${tab === t ? " is-on" : ""}`} aria-current={tab === t ? "page" : undefined}>
          {label}
          {dot === t && <span className="zq-pl-dot" aria-label="Something to review" />}
        </a>
      ))}
    </nav>
  );
}
