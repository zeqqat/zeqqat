"use client";

import { useSyncExternalStore } from "react";
import { durationText, exactParts, relativeTime, utcText } from "../../lib/activity-format";

// Times on the Activity screens are shown in the viewer's own time zone,
// which only the browser knows. The server renders UTC; once hydrated, the
// browser renders again in its own zone (useSyncExternalStore gives the
// server snapshot during hydration and the client one right after).
const noop = () => () => {};
function useZone(): string | undefined {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
}

export function RelTime({ iso }: { iso: string }) {
  const tz = useZone();
  const at = new Date(iso);
  const { date, time, zone } = exactParts(at, tz);
  return (
    <time className="zq-rc-time" dateTime={iso} title={`${date}, ${time} ${zone} (${utcText(at)})`} suppressHydrationWarning>
      {relativeTime(at, new Date(), tz)}
    </time>
  );
}

export function Clock({ iso, ms }: { iso: string; ms?: number | null }) {
  const tz = useZone();
  const at = new Date(iso);
  const { time } = exactParts(at, tz);
  return (
    <time className="zq-cc-clock" dateTime={iso} title={utcText(at)} suppressHydrationWarning>
      {time}
      {ms != null ? ` · ${durationText(ms)}` : ""}
    </time>
  );
}

// The striped bar under a request card: when it started, exactly.
export function DateBar({ start, end, running }: { start: string; end: string; running: boolean }) {
  const s = new Date(start);
  const e = new Date(end);
  const tz = useZone();
  const a = exactParts(s, tz);
  const b = exactParts(e, tz);
  return (
    <div className="zq-datebar">
      <div className="zq-datebar-in" title={utcText(s)}>
        <b suppressHydrationWarning>
          {a.date}, {a.time} {a.zone}
        </b>
        <span suppressHydrationWarning>
          {running
            ? `Started ${a.time} ${a.zone} · still running`
            : `${a.time} to ${b.time} ${b.zone} · took ${durationText(Math.max(0, e.getTime() - s.getTime()))}`}
        </span>
      </div>
    </div>
  );
}

export function ExactTime({ iso }: { iso: string }) {
  const tz = useZone();
  const at = new Date(iso);
  const { date, time, zone } = exactParts(at, tz);
  return (
    <span suppressHydrationWarning>
      {date}, {time} {zone}
      <br />
      <small>{utcText(at)}</small>
    </span>
  );
}
