"use client";

import { useActionState } from "react";
import { resetLinkAction, type ResetLinkState } from "../lib/actions/password";
import { CopyButton } from "./CopyButton";

// For the install's owner on the Team page: makes a one-time password reset
// link to send to someone who forgot theirs (installs without a mailer).
export function ResetLinkButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<ResetLinkState, FormData>(resetLinkAction, {});
  if (state.link) {
    return (
      <div className="zq-cbox-row" style={{ maxWidth: 360 }}>
        <code style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.link}</code>
        <CopyButton text={state.link} />
      </div>
    );
  }
  return (
    <form action={action} className="zq-inline-form">
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" className="zq-action zq-action-sm" disabled={pending} title={state.error}>
        {state.error ? "Couldn't make link" : "Password reset link"}
      </button>
    </form>
  );
}
