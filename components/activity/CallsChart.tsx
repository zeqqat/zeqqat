"use client";

import { useState, useSyncExternalStore } from "react";
import { CHART_COOKIE } from "../../lib/activity-format";

// Calls per hour today, as bars, at the top of Activity's "today" view
// (what the overview's "Calls today" tile opens). The eye in the corner
// hides and shows the chart; the choice is kept in a cookie so the server
// renders it the same way next time, with no flash.
//
// The day is the UTC day (the window the tile counts), but each bar is
// labelled in the viewer's own time zone, like every other time here.

const HOURS = 24;

const noop = () => () => {};
function useZone(): string {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
}

function hourLabel(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(at);
}

export function CallsChart({ hourly, dayStart, initialHidden }: { hourly: number[]; dayStart: string; initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden);
  const [active, setActive] = useState<number | null>(null);
  const tz = useZone();
  const start = new Date(dayStart).getTime();
  const total = hourly.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...hourly);
  const at = (h: number) => new Date(start + h * 3600_000);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    document.cookie = `${CHART_COOKIE}=${next ? "hidden" : "shown"}; path=/; max-age=31536000; samesite=lax`;
  }

  const readout =
    active != null && active < hourly.length
      ? `${hourLabel(at(active), tz)} to ${hourLabel(at(active + 1), tz)} · ${hourly[active]} ${hourly[active] === 1 ? "call" : "calls"}`
      : `${total} ${total === 1 ? "call" : "calls"} today`;

  return (
    <section className={`zq-chart${hidden ? " is-hidden" : ""}`} aria-label="Calls per hour today">
      <div className="zq-chart-head">
        <span className="zq-chart-readout" suppressHydrationWarning>
          {hidden ? "Calls per hour" : readout}
        </span>
        <button
          type="button"
          className="zq-chart-eye"
          onClick={toggle}
          aria-pressed={!hidden}
          aria-label={hidden ? "Show the chart" : "Hide the chart"}
          title={hidden ? "Show the chart" : "Hide the chart"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {hidden && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {!hidden && (
        <div className="zq-chart-body">
          <div className="zq-chart-plot" onMouseLeave={() => setActive(null)}>
            <span className="zq-chart-peak">{peak}</span>
            {Array.from({ length: HOURS }, (_, h) => {
              const n = h < hourly.length ? hourly[h] : null;
              return (
                <div
                  key={h}
                  className={`zq-chart-col${n == null ? " is-later" : ""}${active === h ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(n == null ? null : h)}
                  onFocus={() => setActive(n == null ? null : h)}
                  onBlur={() => setActive(null)}
                  tabIndex={n == null ? -1 : 0}
                  role="img"
                  aria-label={n == null ? undefined : `${hourLabel(at(h), tz)}: ${n} ${n === 1 ? "call" : "calls"}`}
                  suppressHydrationWarning
                >
                  {n != null && <i className={n === 0 ? "is-zero" : undefined} style={{ height: n === 0 ? "2px" : `${Math.max(3, (n / peak) * 100)}%` }} />}
                </div>
              );
            })}
          </div>
          <div className="zq-chart-x" aria-hidden="true">
            {Array.from({ length: HOURS }, (_, h) => (
              <span key={h} suppressHydrationWarning>
                {h % 3 === 0 ? hourLabel(at(h), tz) : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
