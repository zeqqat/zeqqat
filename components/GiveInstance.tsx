"use client";

import { useState } from "react";
import { giveInstancesAction } from "../lib/actions/instances";
import { IntegrationMark } from "./Marks";

type Choice = { id: string; alias: string; host: string; appSlug: string; appName: string; appLogo: string | null };

// "Add an instance" on a workspace's Dokploy Instances page: tick some of
// the account's instances this workspace can't use yet, or connect another
// Dokploy instance (which then belongs to the account and joins here).
export function GiveInstance({ choices, workspace, connectHref }: { choices: Choice[]; workspace: string; connectHref: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="zq-action zq-action-primary" onClick={() => setOpen(true)}>
        Add an instance
      </button>
      {open && (
        <div className="zq-modal-back" onClick={() => setOpen(false)}>
          <div className="zq-modal" role="dialog" aria-modal="true" aria-labelledby="zq-give-t" onClick={(e) => e.stopPropagation()}>
            <div className="zq-modal-head">
              <h2 id="zq-give-t">Add an instance to {workspace}</h2>
              <button type="button" className="zq-modal-x" aria-label="Close" onClick={() => setOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="zq-new-body">
              {choices.length ? (
                <form action={giveInstancesAction}>
                  <div className="zq-ipick-list">
                    {choices.map((c) => (
                      <label key={c.id} className="zq-ipick">
                        <input type="checkbox" name="instance_id" value={c.id} />
                        <IntegrationMark slug={c.appSlug} name={c.appName} logo={c.appLogo} size={16} />
                        <span className="t">
                          <b>{c.alias}</b>
                          <small>{c.host}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <a className="zq-textlink zq-give-link" href={connectHref}>
                    + Connect another Dokploy instance
                  </a>
                  <div className="zq-give-foot">
                    <button type="submit" className="zq-action zq-action-primary">
                      Add to {workspace}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="zq-modal-note">Every instance this account has is already in {workspace}.</p>
                  <div className="zq-give-foot">
                    <a className="zq-action zq-action-primary" href={connectHref}>
                      Connect another Dokploy instance
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
