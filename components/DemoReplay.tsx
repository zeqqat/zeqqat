"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityCall } from "../lib/activity";
import type { CallState } from "../lib/activity-format";
import { lookupText } from "../lib/activity-format";
import {
  DEMO_CONNECTION,
  DEMO_INSTANCE,
  DEMO_PERSON,
  isLookup,
  type Replay,
  type ReplayCall,
  type ReplayLookup,
} from "../lib/demo-replays";
import { CallCard, LookupLine } from "./activity/CallCard";
import { Avatar, Strip, Tally } from "./activity/Parts";
import { Pills } from "./activity/Pills";
import { DateBar, RelTime } from "./activity/Time";
import { AgentMark } from "./Marks";

// Plays one replay: the agent's chat on the left, Zeqqat's activity on the
// right, step by step and in step with each other, so a visitor sees what
// the agent got and what Zeqqat recorded at the same moment. The right side
// uses the app's own Activity components (request card, call cards, lookup
// lines), so it looks exactly like a workspace's Activity page. Everything is pre-written
// (lib/demo-replays.ts); nothing here talks to a server.

type Beat =
  | { t: "ask"; turn: number }
  | { t: "step"; turn: number; step: number }
  | { t: "para"; turn: number; para: number };

const DELAY: Record<Beat["t"], number> = { ask: 900, step: 1000, para: 650 };

function beatsOf(replay: Replay): Beat[] {
  const out: Beat[] = [];
  replay.turns.forEach((turn, ti) => {
    out.push({ t: "ask", turn: ti });
    turn.steps.forEach((_, si) => out.push({ t: "step", turn: ti, step: si }));
    turn.answer.forEach((_, pi) => out.push({ t: "para", turn: ti, para: pi }));
  });
  return out;
}

// `code` spans in the scripted text. A paragraph starting with "> " is a
// log excerpt, shown as a block.
function Text({ s }: { s: string }) {
  return (
    <>
      {s.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>))}
    </>
  );
}

const BASE: Omit<ActivityCall, "id" | "at" | "state" | "lookup" | "lookupTool" | "toolName" | "reason"> = {
  requestId: null,
  httpStatus: null,
  durationMs: 0,
  op: null,
  summary: null,
  kind: null,
  method: null,
  path: null,
  integrationRef: null,
  integrationSlug: null,
  instanceId: null,
  instanceAlias: null,
  instanceBaseUrl: null,
  connectionId: null,
  connectionName: DEMO_CONNECTION,
  connectionShortId: null,
  connectionUrl: null,
  workspaceName: "Default",
  account: { username: DEMO_PERSON.username, type: "personal" },
  inputs: null,
  response: null,
  outbound: null,
  errorMessage: null,
  redactions: 0,
  policyName: null,
  policyVersion: null,
  callerRole: "admin",
  specRelease: null,
  person: DEMO_PERSON,
  agent: { host: "claude.ai" },
};

function lookupCall(s: ReplayLookup, id: string, at: string, reason: string): ActivityCall {
  return {
    ...BASE,
    id,
    at,
    state: "ok",
    lookup: lookupText("search", { query: s.search }),
    lookupTool: "zeqqat_search",
    toolName: "zeqqat_search",
    reason,
  };
}

function appCall(s: ReplayCall, id: string, at: string, reason: string): ActivityCall {
  return {
    ...BASE,
    id,
    at,
    state: s.outcome,
    durationMs: s.ms,
    lookup: null,
    lookupTool: null,
    toolName: `@zeqqat/dokploy.http.${s.action}`,
    op: s.tool,
    summary: s.summary,
    kind: s.kind,
    integrationRef: "@zeqqat/dokploy",
    integrationSlug: "dokploy",
    instanceAlias: DEMO_INSTANCE,
    inputs: s.inputs,
    errorMessage: s.outcome === "blocked" ? `Not sent: ${s.kind} on "${DEMO_INSTANCE}" isn't allowed through this MCP URL.` : null,
    redactions: s.hidden ?? 0,
    reason,
  };
}

export function DemoReplay({ replay }: { replay: Replay }) {
  const beats = useMemo(() => beatsOf(replay), [replay]);
  // When each beat appeared (ms), so Activity's clocks read like a real run.
  const [times, setTimes] = useState<number[]>([]);
  const [run, setRun] = useState(0);
  // The request opened on the Zeqqat side (a turn index), or the list.
  const [open, setOpen] = useState<number | null>(null);
  const shown = times.length;

  // Starts empty (on mount, and from "Play again", which clears it first).
  // With reduced motion everything shows at once.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (i >= beats.length) return;
      timer = setTimeout(
        () => {
          const now = Date.now();
          if (reduce) {
            i = beats.length;
            setTimes(beats.map(() => now));
          } else {
            i += 1;
            setTimes((t) => [...t, now]);
          }
          next();
        },
        reduce ? 0 : DELAY[beats[i].t],
      );
    };
    next();
    return () => clearTimeout(timer);
  }, [beats, run]);

  const at = (pred: (b: Beat) => boolean): number | null => {
    const i = beats.findIndex(pred);
    return i >= 0 && i < shown ? times[i] : null;
  };
  const iso = (ms: number) => new Date(ms).toISOString();
  const done = shown >= beats.length;
  const waiting = !done && shown > 0 && beats[shown]?.t !== "ask";

  return (
    <div className="zq-demo">
      <section className="zq-demo-pane" aria-label="In your agent">
        <header className="zq-demo-head">
          <AgentMark host="claude.ai" size={14} />
          <b>Claude</b>
          <span className="zq-demo-head-sub">your agent</span>
        </header>
        <div className="zq-demo-chat" aria-live="polite">
          {replay.turns.map((turn, ti) => {
            if (at((b) => b.t === "ask" && b.turn === ti) == null) return null;
            return (
              <div key={ti} className="zq-demo-turn">
                <p className="zq-demo-you">{turn.ask}</p>
                {turn.steps.map((s, si) => {
                  if (at((b) => b.t === "step" && b.turn === ti && b.step === si) == null) return null;
                  if (isLookup(s)) {
                    return (
                      <p key={si} className="zq-demo-tool">
                        <span className="zq-demo-tool-k">zeqqat_search</span> {s.search}
                      </p>
                    );
                  }
                  return (
                    <p key={si} className={`zq-demo-tool${s.outcome === "blocked" ? " is-blocked" : ""}`}>
                      <span className="zq-demo-tool-k">zeqqat_{s.kind}</span> {s.tool}
                      {s.hidden ? (
                        <span className="zq-demo-tool-h">
                          {s.hidden} {s.hidden === 1 ? "secret" : "secrets"} as {"{{zq_secret_…}}"}
                        </span>
                      ) : null}
                      {s.outcome === "blocked" && <span className="zq-demo-tool-h">not allowed</span>}
                    </p>
                  );
                })}
                {turn.answer.map((p, pi) =>
                  at((b) => b.t === "para" && b.turn === ti && b.para === pi) == null ? null : p.startsWith("> ") ? (
                    <pre key={pi} className="zq-demo-pre">
                      {p.slice(2)}
                    </pre>
                  ) : (
                    <p key={pi} className="zq-demo-ai">
                      <Text s={p} />
                    </p>
                  ),
                )}
              </div>
            );
          })}
          {waiting && (
            <p className="zq-demo-typing" aria-label="Working">
              <span />
              <span />
              <span />
            </p>
          )}
        </div>
      </section>

      <section className="zq-demo-pane" aria-label="In Zeqqat">
        <header className="zq-demo-head">
          <span className="zq-logo zq-demo-z" aria-hidden="true">
            Z
          </span>
          <b>Zeqqat</b>
          <span className="zq-demo-head-sub">activity</span>
        </header>
        <div className="zq-demo-log">
          {(() => {
            // Each turn is one request. Like a workspace's Activity page: a list of
            // request cards (newest first), and a card opens its calls.
            const reqs = replay.turns
              .map((turn, ti) => {
                const askedAt = at((b) => b.t === "ask" && b.turn === ti);
                if (askedAt == null) return null;
                const calls: ActivityCall[] = [];
                turn.steps.forEach((s, si) => {
                  const t = at((b) => b.t === "step" && b.turn === ti && b.step === si);
                  if (t == null) return;
                  const id = `demo-${replay.slug}-${ti}-${si}`;
                  calls.push(isLookup(s) ? lookupCall(s, id, iso(t), turn.ask) : appCall(s, id, iso(t), turn.ask));
                });
                const states: CallState[] = calls.filter((c) => !c.lookup).map((c) => c.state);
                const last = calls.length ? calls[calls.length - 1].at : iso(askedAt);
                return { ti, ask: turn.ask, calls, states, lookups: calls.length - states.length, last };
              })
              .filter((r) => r != null);
            const card = (r: (typeof reqs)[number], linked: boolean) => (
              <div className={`zq-rc${linked ? " is-link" : ""}`}>
                {linked && (
                  <button
                    type="button"
                    className="zq-rc-link zq-demo-open"
                    aria-label={`Open: ${r.ask}`}
                    onClick={() => setOpen(r.ti)}
                  />
                )}
                <Avatar person={DEMO_PERSON} />
                <div className="zq-rc-body">
                  <div className="zq-rc-top">
                    <b>{DEMO_PERSON.name}</b>
                    <span className="zq-rc-handle">@{DEMO_PERSON.username}</span>
                    <span className="zq-rc-sep">·</span>
                    <RelTime iso={r.last} />
                  </div>
                  <p className="zq-rc-req">{r.ask}</p>
                  <div className="zq-rc-foot">
                    <span className="zq-rc-via">
                      via <AgentMark host="claude.ai" size={13} />
                      <b>Claude</b>
                    </span>
                    <Strip states={r.states} />
                    {r.calls.length > 0 && <Tally states={r.states} lookups={r.lookups} />}
                  </div>
                  {r.states.length > 0 && (
                    <Pills
                      instances={[{ key: "i", label: DEMO_INSTANCE, calls: r.states.length, href: null }]}
                      urls={[{ key: "u", label: DEMO_CONNECTION, calls: r.states.length, href: null }]}
                    />
                  )}
                </div>
              </div>
            );
            const opened = open == null ? null : reqs.find((r) => r.ti === open);
            if (opened) {
              return (
                <>
                  <button type="button" className="zq-back zq-demo-back" onClick={() => setOpen(null)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M15 6l-6 6 6 6" />
                    </svg>
                    Activity
                  </button>
                  <div className="zq-act-sheet zq-demo-sheet">
                    {card(opened, false)}
                    {opened.calls.length > 0 && (
                      <DateBar start={opened.calls[0].at} end={opened.last} running={false} />
                    )}
                    {opened.calls.map((c) =>
                      c.lookup ? <LookupLine key={c.id} call={c} /> : <CallCard key={c.id} call={c} json />,
                    )}
                  </div>
                </>
              );
            }
            if (reqs.length === 0) return null;
            return (
              <>
                <div className="zq-act-list zq-demo-sheet">
                  {[...reqs].reverse().map((r) => (
                    <div key={r.ti} className="zq-demo-row">
                      {card(r, true)}
                    </div>
                  ))}
                </div>
                {done && <p className="zq-demo-hint">Click a request to see each call Zeqqat logged.</p>}
              </>
            );
          })()}
        </div>
      </section>

      <div className="zq-demo-foot">
        <button
          type="button"
          className="zq-demo-replay"
          onClick={() => {
            setTimes([]);
            setOpen(null);
            setRun((n) => n + 1);
          }}
          disabled={!done}
        >
          {done ? "Play again" : "Playing…"}
        </button>
      </div>
    </div>
  );
}
