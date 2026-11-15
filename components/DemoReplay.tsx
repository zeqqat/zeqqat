"use client";

import { useEffect, useMemo, useState } from "react";
import type { Replay } from "../lib/demo-replays";
import { AgentMark } from "./Marks";

// Plays one replay: the agent's chat on the left, Zeqqat's activity on the
// right, step by step and in step with each other, so a visitor sees what
// the agent got and what Zeqqat recorded at the same moment. Everything is
// pre-written (lib/demo-replays.ts); nothing here talks to a server.

type Step =
  { t: "ask"; turn: number } | { t: "call"; turn: number; call: number } | { t: "para"; turn: number; para: number };

const DELAY: Record<Step["t"], number> = { ask: 900, call: 1000, para: 650 };

function stepsOf(replay: Replay): Step[] {
  const out: Step[] = [];
  replay.turns.forEach((turn, ti) => {
    out.push({ t: "ask", turn: ti });
    turn.calls.forEach((_, ci) => out.push({ t: "call", turn: ti, call: ci }));
    turn.answer.forEach((_, pi) => out.push({ t: "para", turn: ti, para: pi }));
  });
  return out;
}

// `code` spans in the scripted text. A paragraph starting with "> " is a
// log excerpt, shown as a block.
function Text({ s }: { s: string }) {
  return <>{s.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>))}</>;
}

export function DemoReplay({ replay }: { replay: Replay }) {
  const steps = useMemo(() => stepsOf(replay), [replay]);
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);

  // Starts at 0 (on mount, and from "Play again", which resets it first).
  // With reduced motion everything shows at once.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (i >= steps.length) return;
      timer = setTimeout(
        () => {
          i = reduce ? steps.length : i + 1;
          setShown(i);
          next();
        },
        reduce ? 0 : DELAY[steps[i].t],
      );
    };
    next();
    return () => clearTimeout(timer);
  }, [steps, run]);

  const seen = steps.slice(0, shown);
  const has = (pred: (s: Step) => boolean) => seen.some(pred);
  const done = shown >= steps.length;
  const waiting = !done && shown > 0 && steps[shown]?.t !== "ask";

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
            if (!has((s) => s.t === "ask" && s.turn === ti)) return null;
            return (
              <div key={ti} className="zq-demo-turn">
                <p className="zq-demo-you">{turn.ask}</p>
                {turn.calls.map((c, ci) =>
                  has((s) => s.t === "call" && s.turn === ti && s.call === ci) ? (
                    <p key={ci} className={`zq-demo-tool${c.outcome === "blocked" ? " is-blocked" : ""}`}>
                      <span className="zq-demo-tool-k">zeqqat_run</span> {c.tool}
                      {c.hidden ? (
                        <span className="zq-demo-tool-h">
                          {c.hidden} {c.hidden === 1 ? "secret" : "secrets"} as {"{{zq_secret_…}}"}
                        </span>
                      ) : null}
                      {c.outcome === "blocked" && <span className="zq-demo-tool-h">not allowed</span>}
                    </p>
                  ) : null,
                )}
                {turn.answer.map((p, pi) =>
                  has((s) => s.t === "para" && s.turn === ti && s.para === pi) ? (
                    p.startsWith("> ") ? (
                      <pre key={pi} className="zq-demo-pre">
                        {p.slice(2)}
                      </pre>
                    ) : (
                      <p key={pi} className="zq-demo-ai">
                        <Text s={p} />
                      </p>
                    )
                  ) : null,
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
          {replay.turns.map((turn, ti) => {
            if (!has((s) => s.t === "ask" && s.turn === ti)) return null;
            const calls = turn.calls.filter((_, ci) => has((s) => s.t === "call" && s.turn === ti && s.call === ci));
            const blocked = calls.filter((c) => c.outcome === "blocked").length;
            const hidden = calls.reduce((n, c) => n + (c.hidden ?? 0), 0);
            return (
              <div key={ti} className="zq-demo-req">
                <p className="zq-demo-req-q">&ldquo;{turn.ask}&rdquo;</p>
                <p className="zq-demo-req-by">
                  @you via Claude · {calls.length} {calls.length === 1 ? "call" : "calls"}
                  {blocked > 0 && <span className="zq-demo-bad"> · {blocked} blocked</span>}
                  {hidden > 0 && (
                    <span className="zq-demo-hid">
                      {" "}
                      · {hidden} {hidden === 1 ? "secret" : "secrets"} hidden
                    </span>
                  )}
                </p>
                {calls.map((c, ci) => (
                  <div key={ci} className="zq-demo-call">
                    <div className="zq-demo-call-top">
                      <code>{c.tool}</code>
                      <span className={`zq-kind k-${c.kind}`}>{c.kind}</span>
                      <span className={`zq-demo-out is-${c.outcome}`}>{c.outcome === "ok" ? "ok" : "blocked"}</span>
                    </div>
                    {c.note && <p className="zq-demo-call-note">{c.note}</p>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <div className="zq-demo-foot">
        <button type="button" className="zq-demo-replay" onClick={() => {
            setShown(0);
            setRun((n) => n + 1);
          }} disabled={!done}>
          {done ? "Play again" : "Playing…"}
        </button>
      </div>
    </div>
  );
}
