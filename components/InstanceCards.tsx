"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IntegrationMark } from "./Marks";
import { changedPart } from "../lib/version-diff";
import { Icon, PeriodPick, Spark, type Period, type UrlUsage } from "./McpUrls";

// The Dokploy Instances list (app/app/dokploy-instances). Each card, three
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

function Card({ c }: { c: InstanceCard }) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("week");
  const values = series(c.usage, period);
  const href = `/app/instances/${c.id}`;
  const bad = c.status !== null && c.status !== "ok";
  const tone = c.status === "ok" ? " is-ok" : bad ? " is-bad" : "";
  const word = c.status ? (STATUS_WORDS[c.status] ?? c.status) : "Not checked yet";
  return (
    <div
      className="zq-di-card"
      role="link"
      tabIndex={0}
      aria-label={`${c.name}, ${c.host}`}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
      }}
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

export function InstanceCards({ cards, addHref, emptyText }: { cards: InstanceCard[]; addHref: string | null; emptyText: string }) {
  return (
    <div className="zq-di-list">
      {addHref && (
        <a className="zq-mu-addrow zq-di-add" href={addHref}>
          <span aria-hidden="true">+</span>Add an instance
        </a>
      )}
      {cards.length === 0 && !addHref && <p className="zq-empty zq-di-empty">{emptyText}</p>}
      {cards.map((c) => (
        <Card key={c.id} c={c} />
      ))}
    </div>
  );
}
