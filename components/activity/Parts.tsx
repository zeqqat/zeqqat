import type { CallState } from "../../lib/activity-format";
import { countStates, stripMode, tallyParts } from "../../lib/activity-format";
import type { Person } from "../../lib/activity";
import { IntegrationMark } from "../Marks";

const WORD: Record<CallState, string> = { ok: "done", running: "running", blocked: "blocked", error: "failed" };

const PIP: Record<CallState, React.ReactNode> = {
  ok: (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 5.2l2 2 4-4.4" />
    </svg>
  ),
  blocked: (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
    </svg>
  ),
  error: <span aria-hidden="true">!</span>,
  running: (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 1.5a3.5 3.5 0 1 1-3.5 3.5" />
    </svg>
  ),
};

export function Avatar({ person }: { person: Person }) {
  const name = person?.name ?? "Public connection";
  return (
    <span className="zq-av" aria-hidden="true">
      {person?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        (name.trim().charAt(0) || "?").toUpperCase()
      )}
    </span>
  );
}

// Zeqqat, a line, the integration's logo; the call's state on the end.
// Always the same width so rows line up. A built-in call that never left
// Zeqqat has an empty slot where the integration would be.
export function Chain({
  state,
  integrationSlug,
  integrationName,
  instance,
}: {
  state: CallState;
  integrationSlug: string;
  integrationName: string;
  instance: string | null;
}) {
  const label = `${WORD[state]}${instance ? `, on ${instance}` : ""}`;
  return (
    <span className="zq-chain" role="img" aria-label={label} title={label}>
      <span className="zq-tile is-z">Z</span>
      <span className={`zq-link-line${state === "blocked" ? " is-off" : state === "running" ? " is-running" : ""}`} />
      <span className={`zq-chain-end is-${state}`}>
        <span className="zq-tile">
          <IntegrationMark slug={integrationSlug} name={integrationName} size={11} />
        </span>
        <span className={`zq-pip is-${state}`}>{PIP[state]}</span>
      </span>
    </span>
  );
}

export function Strip({ states }: { states: CallState[] }) {
  const mode = stripMode(states.length);
  const n = countStates(states);
  const label = `${states.length} calls: ${(Object.keys(n) as CallState[])
    .filter((k) => n[k])
    .map((k) => `${n[k]} ${WORD[k]}`)
    .join(", ")}`;
  if (states.length === 0) return null;
  if (mode === "bar") {
    return (
      <span className="zq-strip is-bar" role="img" aria-label={label}>
        {(["ok", "running", "blocked", "error"] as CallState[])
          .filter((k) => n[k])
          .map((k) => (
            <i key={k} className={`is-${k}`} style={{ flex: n[k] }} />
          ))}
      </span>
    );
  }
  return (
    <span className={`zq-strip is-${mode}`} role="img" aria-label={label}>
      {states.map((s, i) => (
        <i key={i} className={`is-${s}`} />
      ))}
    </span>
  );
}

export function Tally({ states, lookups }: { states: CallState[]; lookups: number }) {
  if (states.length === 0) {
    return <span className="zq-tally">{lookups === 1 ? "1 lookup" : `${lookups} lookups`}</span>;
  }
  const t = tallyParts(states);
  return (
    <span className="zq-tally">
      {t.total}
      {t.extra.map((e) => (
        <span key={e.state}>
          {" · "}
          <span className={`is-${e.state}`}>{e.text}</span>
        </span>
      ))}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="zq-back">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {children}
    </a>
  );
}
