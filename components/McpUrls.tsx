"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { InfoBubble } from "./activity/InfoBubble";

// The MCP URLs list (app/app/mcp-urls/page.tsx) and the parts its URL
// page reuses, the card included. Each card: the URL with a clock beside it when it turns
// off; under it, people (or a globe when public) and instances on the
// left, the calls line and number on the right. Clicking the period
// ("this week") switches between today, this week and this month.

export type Period = "today" | "week" | "month";
const PERIODS: Period[] = ["today", "week", "month"];
const PERIOD_LABEL: Record<Period, string> = { today: "today", week: "this week", month: "this month" };

export type UrlUsage = { days: number[]; hours: number[] };
export type UrlItem = {
  id: string;
  url: string;
  prefix: string; // https://zeqqat.com/<org>/mcp/
  name: string;
  shortId: string;
  isPublic: boolean;
  state: "live" | "warning" | "cutoff";
  cutoff: string | null; // "Dec 1, 2026"
  people: number;
  instances: number;
  usage: UrlUsage;
};

// Today stops at the current hour, so the line doesn't fall to zero for
// hours that haven't happened yet.
const series = (u: UrlUsage, p: Period) =>
  p === "today" ? u.hours.slice(0, new Date().getUTCHours() + 1) : p === "week" ? u.days.slice(23) : u.days;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const fmt = (n: number) => n.toLocaleString("en-US");

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function Icon({ name }: { name: "copy" | "done" | "person" | "apps" | "clock" | "globe" | "link" }) {
  const p = {
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </>
    ),
    done: <path d="M5 12l5 5L20 7" />,
    person: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </>
    ),
    apps: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    link: (
      <>
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </>
    ),
  }[name];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {p}
    </svg>
  );
}

// A square copy button with an icon; shows a tick for a moment.
export function CopyIcon({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`zq-mu-copy${done ? " is-done" : ""}`}
      aria-label="Copy URL"
      title="Copy URL"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // Clipboard refused: the URL is on screen to select by hand.
        }
      }}
    >
      <Icon name={done ? "done" : "copy"} />
    </button>
  );
}

// The URL with the repeated part quiet, breaking only at its slashes.
export function UrlText({ item }: { item: Pick<UrlItem, "prefix" | "name" | "shortId"> }) {
  return (
    <>
      <span className="zq-mu-host">{item.prefix}</span>
      <wbr />
      {item.name}/<wbr />
      {item.shortId}
    </>
  );
}

// An icon with words on hover or click: the clock (turns off, turned off)
// and the globe (public).
export function StatusIcon({ icon, text, tone, below = false }: { icon: "clock" | "globe"; text: string; tone: "warn" | "off"; below?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <span ref={ref} className={`zq-mu-st is-${tone}${below ? " is-below" : ""}`}>
      <button
        type="button"
        className="zq-mu-st-b"
        aria-label={text}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name={icon} />
      </button>
      <span className="zq-mu-st-t" role="tooltip" data-open={open ? "1" : undefined}>
        {text}
      </span>
    </span>
  );
}

export function Spark({ values, label, w = 96, h = 24 }: { values: number[]; label: string; w?: number; h?: number }) {
  const max = Math.max(...values, 1);
  const step = w / Math.max(values.length - 1, 1);
  const line = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg className="zq-mu-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={w === 96 && h === 24 ? undefined : { width: w, height: h }}>
      <path className="f" d={`${line} L${w} ${h} L0 ${h} Z`} />
      <path className="l" d={line} />
    </svg>
  );
}

// "this week" with a dotted line on hover; a click opens the choices.
export function PeriodPick({ value, onChange, align = "right" }: { value: Period; onChange: (p: Period) => void; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <span ref={ref} className="zq-mu-per">
      <button
        type="button"
        className="zq-mu-per-b"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {PERIOD_LABEL[value]}
      </button>
      {open && (
        <span className={`zq-mu-per-m is-${align}`} role="menu" onClick={(e) => e.stopPropagation()}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="menuitemradio"
              aria-checked={p === value}
              className={p === value ? "on" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onChange(p);
                setOpen(false);
              }}
            >
              {PERIOD_LABEL[p][0].toUpperCase() + PERIOD_LABEL[p].slice(1)}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function Card({
  item,
  period,
  onPeriod,
  description = null,
  linked = true,
}: {
  item: UrlItem;
  period: Period;
  onPeriod: (p: Period) => void;
  // Only the URL's own page shows the description, under the calls line.
  description?: string | null;
  // The list's cards open the URL's page; the page's own card doesn't.
  linked?: boolean;
}) {
  const router = useRouter();
  const values = series(item.usage, period);
  const off = item.state === "cutoff";
  const href = `/app/mcp-urls/${item.id}`;
  // A div, not a link: the card holds buttons (copy, period, status).
  const link = linked
    ? {
        role: "link",
        tabIndex: 0,
        "aria-label": item.url,
        onClick: () => router.push(href),
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
        },
      }
    : {};
  return (
    <div className={`zq-mu-card${off ? " is-off" : ""}${linked ? "" : " is-static"}`} {...link}>
      <div className="zq-mu-l1">
        <code className="zq-mu-url">
          <UrlText item={item} />
          {item.state !== "live" && item.cutoff && (
            <StatusIcon icon="clock" tone={off ? "off" : "warn"} text={off ? `Turned off ${item.cutoff}` : `Turns off ${item.cutoff}`} />
          )}
        </code>
        {!off && <CopyIcon text={item.url} />}
      </div>
      <div className="zq-mu-l2">
        <span className="zq-mu-counts">
          {item.isPublic && !off ? (
            <StatusIcon icon="globe" tone="warn" below text="Public: anyone with the URL can read, no sign-in" />
          ) : (
            <span className="zq-mu-ic" title={`${item.people} connected`}>
              <Icon name="person" />
              <b>{item.people}</b>
            </span>
          )}
          <span className="zq-mu-ic" title={`${item.instances} Dokploy instance${item.instances === 1 ? "" : "s"}`}>
            <Icon name="apps" />
            <b>{item.instances}</b>
          </span>
        </span>
        <span className="zq-mu-use">
          <Spark values={values} label={`Calls ${PERIOD_LABEL[period]}`} />
          <span className="zq-mu-calls">
            <b>{fmt(sum(values))}</b>
            <PeriodPick value={period} onChange={onPeriod} />
          </span>
        </span>
      </div>
      {description && <p className="zq-mu-bio">{description}</p>}
    </div>
  );
}

// The URL's page opens with the same card as the list, its description
// under it, then the tabs.
export function McpUrlCard({ item, description }: { item: UrlItem; description: string | null }) {
  const [period, setPeriod] = useState<Period>("week");
  return (
    <div className="zq-mu-list is-one">
      <Card item={item} period={period} onPeriod={setPeriod} description={description} linked={false} />
    </div>
  );
}

export function McpUrlList({ items, newHref, children }: { items: UrlItem[]; newHref: string | null; children?: React.ReactNode }) {
  // The switch at the top sets every card; a card's own switch overrides it.
  const [period, setPeriod] = useState<Period>("week");
  const [own, setOwn] = useState<Record<string, Period>>({});
  const totalCalls = sum(items.map((i) => sum(series(i.usage, period))));

  return (
    <div>
      <div className="zq-mu-head">
        {items.length > 0 && (
          <div className="zq-mu-total">
            <span className="zq-mu-total-n">{fmt(totalCalls)}</span>
            <span className="zq-mu-total-l">
              calls{" "}
              <PeriodPick
                value={period}
                align="left"
                onChange={(p) => {
                  setPeriod(p);
                  setOwn({});
                }}
              />
            </span>
          </div>
        )}
        <span className="zq-mu-head-r">
          {newHref && (
            <a className="zq-action zq-action-primary" href={newHref}>
              New MCP URL
            </a>
          )}
          <InfoBubble title="MCP URLs" inline>
            The URLs you give your agents. Paste one into Claude, Cursor or any agent. Each one has its own access: which Dokploy
            instances it reaches and what it may do there. Team members sign in, and their role narrows it further.
          </InfoBubble>
        </span>
      </div>
      {children}
      {items.length > 0 && (
        <div className="zq-mu-list">
          {items.map((item) => (
            <Card key={item.id} item={item} period={own[item.id] ?? period} onPeriod={(p) => setOwn((o) => ({ ...o, [item.id]: p }))} />
          ))}
        </div>
      )}
    </div>
  );
}
