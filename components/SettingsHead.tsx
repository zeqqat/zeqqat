import "./members.css";
import { DokployMark } from "./Marks";

// The card at the top of a Settings page (workspace and account): who this
// is, where it lives, and plain counts. No graphs: this is settings
// (Gaita, 2026-11-21). Tabs follow it inside the same card.

const PATHS: Record<string, React.ReactNode> = {
  url: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  people: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  policy: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  workspaces: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
};

export type Count = { icon: "dokploy" | keyof typeof PATHS; n: number; title: string };

export function SettingsCounts({ counts }: { counts: Count[] }) {
  return (
    <div className="zq-mu-pl zq-st-nums">
      {counts.map((c) => (
        <span key={c.title} className="zq-acc-num" title={c.title} aria-label={`${c.n} ${c.title}`}>
          {c.icon === "dokploy" ? (
            <DokployMark size={13} />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {PATHS[c.icon]}
            </svg>
          )}
          {c.n}
        </span>
      ))}
    </div>
  );
}

export function SettingsTabs({ tabs, tab }: { tabs: [string, string][]; tab: string }) {
  return (
    <nav className="zq-mu-tabs zq-in-tabs" aria-label="Settings">
      {tabs.map(([t, label]) => (
        <a key={t} href={`?tab=${t}`} className={`zq-mu-tab${tab === t ? " is-on" : ""}`} aria-current={tab === t ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
