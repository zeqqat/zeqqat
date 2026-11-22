"use client";
import { useBase } from "./DashboardBase";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IntegrationMark } from "./Marks";
import { WhatIsThis } from "./WhatIsThis";
import { changedPart } from "../lib/version-diff";
import { Icon, PeriodPick, Spark, type Period, type UrlUsage } from "./McpUrls";

// The Dokploy Instances list (app/[org]/[ws]/dokploy-instances). Each card, three
// rows per side that line up (UI principles 39):
//   name                       | graph
//   domain                     | calls, with the period switch
//   MCP URLs and people        | version pill
// Health is the ring around the app's logo: mint when reachable, amber with
// a small warning when not. The version pill is grey; when the app is
// behind, a faint amber line sits under the part that changed, and a click
// says in one line that a newer version is out. Updating lives on the
// instance's own page.

export type InstanceCard = {
  id: string;
  name: string;
  host: string;
  appName: string;
  appSlug: string;
  appLogo: string | null;
  status: string | null; // 'ok' | 'bad_key' | 'unreachable' | 'not_dokploy' | null (never checked)
  version: string | null;
  latest: string | null;
  urls: number;
  people: number;
  usage: UrlUsage;
  // On the account's list: the workspaces that may use it.
  workspaces?: string[];
};

const series = (u: UrlUsage, p: Period) =>
  p === "today" ? u.hours.slice(0, new Date().getUTCHours() + 1) : p === "week" ? u.days.slice(23) : u.days;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const fmt = (n: number) => n.toLocaleString("en-US");

const STATUS_WORDS: Record<string, string> = {
  ok: "Reachable",
  bad_key: "Key rejected",
  unreachable: "Unreachable",
  not_dokploy: "Not answering as Dokploy",
  key_deactivated: "Key deactivated",
};

function VersionPill({ version, latest, appName }: { version: string; latest: string | null; appName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const ch = changedPart(version, latest);
  const shown = version.startsWith("v") ? version : `v${version}`;
  const segs = shown.slice(1).split(".");
  return (
    <span ref={ref} className="zq-di-pw">
      <button
        type="button"
        className="zq-di-vp"
        aria-expanded={open}
        aria-label={`${appName} ${shown}${ch !== null && latest ? `, ${latest} is out` : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        v
        {segs.map((s, i) => (
          <span key={i}>
            {i > 0 && "."}
            <span className={i === ch ? "zq-di-ch" : undefined}>{s}</span>
          </span>
        ))}
      </button>
      {open && (
        <span className="zq-di-pop" role="status" onClick={(e) => e.stopPropagation()}>
          {ch !== null && latest ? (
            <>
              {appName} <b>{latest.startsWith("v") ? latest : `v${latest}`}</b> is out
            </>
          ) : latest ? (
            <>Latest {appName}</>
          ) : (
            <>
              {appName} {shown}
            </>
          )}
        </span>
      )}
    </span>
  );
}

function Card({ c, linkBase }: { c: InstanceCard; linkBase?: string }) {
  const [period, setPeriod] = useState<Period>("week");
  return <InstanceCardView c={c} period={period} onPeriod={setPeriod} linkBase={linkBase} />;
}

// One instance's card. The list's cards open the instance's page; the
// page's own card (linked=false) doesn't, and its period switch drives the
// whole page.
export function InstanceCardView({
  c,
  period,
  onPeriod,
  linked = true,
  linkBase,
}: {
  c: InstanceCard;
  period: Period;
  onPeriod: (p: Period) => void;
  linked?: boolean;
  linkBase?: string;
}) {
  const { ws: wsBase } = useBase();
  const base = linkBase ?? wsBase;
  const router = useRouter();
  const setPeriod = onPeriod;
  const values = series(c.usage, period);
  const href = `${base}/dokploy-instances/${c.id}`;
  const bad = c.status !== null && c.status !== "ok";
  const tone = c.status === "ok" ? " is-ok" : bad ? " is-bad" : "";
  const word = c.status ? (STATUS_WORDS[c.status] ?? c.status) : "Not checked yet";
  return (
    <div
      className={`zq-di-card${linked ? "" : " is-static"}`}
      {...(linked
        ? {
            role: "link",
            tabIndex: 0,
            "aria-label": `${c.name}, ${c.host}`,
            onClick: () => router.push(href),
            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
            },
          }
        : {})}
    >
      <span className={`zq-di-ring${tone}`} title={word} aria-label={word}>
        <IntegrationMark slug={c.appSlug} name={c.appName} logo={c.appLogo} size={18} />
        {bad && (
          <span className="zq-di-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3l9.5 16.5h-19z" />
              <path d="M12 10v4M12 17.2v.1" />
            </svg>
          </span>
        )}
      </span>
      <div className="zq-di-g">
        <b className="zq-di-name" title={c.name}>
          {c.name}
        </b>
        <span className="zq-di-host" title={c.host}>
          {c.host}
        </span>
        <span className="zq-di-counts zq-mu-counts">
          {c.workspaces && (
            <span className="zq-mu-ic" title={c.workspaces.length ? `Workspaces that can use it: ${c.workspaces.join(", ")}` : "No workspace can use it yet"}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="4" />
                <path d="M9 4v16" />
              </svg>
              <b>{c.workspaces.length}</b>
            </span>
          )}
          <span className="zq-mu-ic" title={`${c.urls} MCP URL${c.urls === 1 ? "" : "s"} reach it`}>
            <Icon name="link" />
            <b>{c.urls}</b>
          </span>
          <span className="zq-mu-ic" title={`${c.people} ${c.people === 1 ? "person" : "people"} connected`}>
            <Icon name="person" />
            <b>{c.people}</b>
          </span>
        </span>
        <span className="zq-di-use">
          <Spark values={values} label={`Calls ${period === "today" ? "today" : period === "week" ? "this week" : "this month"}`} w={80} h={22} />
          <span className="zq-mu-calls">
            <b>{fmt(sum(values))}</b>
            <PeriodPick value={period} onChange={setPeriod} />
          </span>
        </span>
        <span className="zq-di-ver">{c.version && <VersionPill version={c.version} latest={c.latest} appName={c.appName} />}</span>
      </div>
    </div>
  );
}

export function InstanceCards({
  cards,
  addHref,
  addSlot,
  emptyText,
  what = false,
  linkBase,
}: {
  cards: InstanceCard[];
  addHref: string | null;
  // In place of the add link: a button that opens something on the page.
  addSlot?: React.ReactNode;
  emptyText: string;
  what?: boolean;
  linkBase?: string;
}) {
  // Same head as the MCP URLs page: the count on the left, the add button on the right.
  return (
    <div>
      <div className="zq-mu-head">
        {cards.length > 0 && (
          <div className="zq-mu-total">
            <span className="zq-mu-total-n">{cards.length}</span>
            <span className="zq-mu-total-l">{cards.length === 1 ? "instance" : "instances"}</span>
          </div>
        )}
        <span className="zq-mu-head-r">
          {addSlot ??
            (addHref && (
              <a className="zq-action zq-action-primary" href={addHref}>
                Add an instance
              </a>
            ))}
        </span>
      </div>
      {cards.length === 0 && <p className="zq-empty">{emptyText}</p>}
      {cards.length > 0 && (
        <WhatIsThis open={what}>
          Each Dokploy you connect is an instance. Your account owns it, and you choose which workspaces can use it.
        </WhatIsThis>
      )}
      {cards.length > 0 && (
        <div className="zq-di-list">
          {cards.map((c) => (
            <Card key={c.id} c={c} linkBase={linkBase} />
          ))}
        </div>
      )}
    </div>
  );
}
