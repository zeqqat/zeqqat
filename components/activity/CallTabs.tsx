"use client";

import { useState, type ReactNode } from "react";

export type CallTab = { id: string; label: string; content: ReactNode };

// The call page's tabs: the call as the agent made it, the request Zeqqat
// sent, the response, the details. One shows at a time; ?tab= keeps the
// choice in the address so a link opens on the same tab.
export function CallTabs({ tabs, initial }: { tabs: CallTab[]; initial: string }) {
  const [tab, setTab] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0].id);
  const go = (id: string) => {
    setTab(id);
    const u = new URL(window.location.href);
    if (id === tabs[0].id) u.searchParams.delete("tab");
    else u.searchParams.set("tab", id);
    window.history.replaceState(null, "", u.toString());
  };
  return (
    <>
      <nav className="zq-mu-tabs zq-call-tabs" aria-label="Call">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`?tab=${t.id}`}
            className={`zq-mu-tab${tab === t.id ? " is-on" : ""}`}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(t.id);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>
      {tabs.map((t) => (
        <div key={t.id} className="zq-call-panel" data-tab={t.id} hidden={tab !== t.id}>
          {t.content}
        </div>
      ))}
    </>
  );
}
