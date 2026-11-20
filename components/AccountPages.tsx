"use client";

import { useEffect, useState } from "react";
import type { AccountMember, WorkspaceCard } from "../lib/accounts";
import { switchWorkspaceAction } from "../lib/actions/workspace";
import { CreateWorkspaceForm } from "./ConnectionForms";
import { InviteForm } from "./InviteForm";
import { DokployMark } from "./Marks";
import { Icon, Spark } from "./McpUrls";
import { AccountAvatar, WorkspaceAvatar } from "./PathSwitch";

// The account level (/<username>): Workspaces and Members. Each list page has
// a big count on the left and its add button on the right, their bottoms
// on one line (Gaita, 2026-11-19).

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="zq-modal-back" onClick={onClose}>
      <div className="zq-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="zq-modal-head">
          <h2>{title}</h2>
          <button type="button" className="zq-modal-x" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="zq-new-body">{children}</div>
      </div>
    </div>
  );
}

export function CountHead({ n, one, many, children }: { n: number; one: string; many: string; children?: React.ReactNode }) {
  return (
    <div className="zq-acc-head">
      <div className="zq-acc-count">
        <span className="zq-acc-count-n">{n}</span>
        <span className="zq-acc-count-l">{n === 1 ? one : many}</span>
      </div>
      {children}
    </div>
  );
}

export function NewWorkspaceButton({ account }: { account: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="zq-action" onClick={() => setOpen(true)}>
        + New workspace
      </button>
      {open && (
        <Modal title={`New workspace in @${account}`} onClose={() => setOpen(false)}>
          <CreateWorkspaceForm />
        </Modal>
      )}
    </>
  );
}

export function InviteButton({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="zq-action" onClick={() => setOpen(true)}>
        + Invite
      </button>
      {open && (
        <Modal title="Invite someone" onClose={() => setOpen(false)}>
          <InviteForm workspace="" workspaces={workspaces} />
        </Modal>
      )}
    </>
  );
}

export function WorkspaceGrid({ cards }: { cards: WorkspaceCard[] }) {
  return (
    <div className="zq-acc-grid">
      {cards.map((c) => {
        const calls = c.week.reduce((a, b) => a + b, 0);
        return (
          <form action={switchWorkspaceAction} key={c.id}>
            <input type="hidden" name="workspace_id" value={c.id} />
            <button type="submit" className="zq-acc-card">
              <span className="r1">
                <WorkspaceAvatar name={c.name} />
                <span className="t">{c.name}</span>
              </span>
              <span className="r2">
                <span className="l">
                  <span className="zq-acc-num" title="Dokploy instances">
                    <DokployMark size={13} />
                    {c.instances}
                  </span>
                  <span className="zq-acc-num" title="MCP URLs">
                    <Icon name="link" />
                    {c.urls}
                  </span>
                  <span className="zq-acc-num" title="People">
                    <Icon name="person" />
                    {c.people}
                  </span>
                </span>
                <span className="zq-acc-num">
                  <Spark values={c.week} label={`${calls} calls this week`} w={56} h={16} />
                  {calls} this week
                </span>
              </span>
            </button>
          </form>
        );
      })}
    </div>
  );
}

export function MemberList({ members }: { members: AccountMember[] }) {
  return (
    <div className="zq-acc-people">
      {members.map((m) => (
        <div className="zq-acc-person" key={m.userId}>
          <AccountAvatar account={{ slug: m.username ?? m.userId, name: m.name || m.username || "?", kind: "personal" }} image={m.image} size="lg" />
          <span className="who">
            <b>
              {m.name || (m.username ? `@${m.username}` : "")}
            </b>
            <small>
              {m.username ? `@${m.username}` : ""}
              {m.owner ? `${m.username ? " · " : ""}owner` : ""}
            </small>
          </span>
          <span className="ws">
            {m.workspaces.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
