"use client";

import { useActionState, useRef, useState } from "react";
import { updateAccountAction, type AccountState } from "../lib/actions/account";

const SIZE = 256;

// Crops the picture to a centred square and shrinks it to 256px, so what's
// stored is a few dozen KB whatever the camera produced.
async function toAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/jpeg", 0.86);
}

export function AccountForm({ name, username, image }: { name: string; username: string; image: string | null }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(updateAccountAction, null);
  const [avatar, setAvatar] = useState<string>("keep");
  const [preview, setPreview] = useState<string | null>(image);
  const [handle, setHandle] = useState(username);
  const [pictureError, setPictureError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // After a save, the saved username is the one to compare against.
  const current = state?.username ?? username;

  const next = handle.trim().replace(/^@/, "");
  const changing = next !== current && next.length > 0;
  const initial = (name.charAt(0) || username.charAt(0) || "?").toUpperCase();

  return (
    <form action={action} className="zq-account">
      <input type="hidden" name="avatar" value={avatar} />
      <div className="zq-account-pic">
        <button type="button" className="zq-account-avatar" onClick={() => fileRef.current?.click()} aria-label="Change picture">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL or provider avatar */}
          {preview ? <img src={preview} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
        </button>
        <div className="zq-account-pic-act">
          <button type="button" className="zq-linkbtn" onClick={() => fileRef.current?.click()}>
            Change picture
          </button>
          {preview && (
            <button
              type="button"
              className="zq-linkbtn zq-linkbtn-dim"
              onClick={() => {
                setPreview(null);
                setAvatar("remove");
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setPictureError("");
            try {
              const url = await toAvatar(f);
              setPreview(url);
              setAvatar(url);
            } catch {
              setPictureError("That picture didn't work. Try a PNG or JPEG.");
            }
          }}
        />
      </div>

      <div>
        <label className="zq-label" htmlFor="acct_name">
          Name
        </label>
        <input className="zq-input" id="acct_name" name="name" defaultValue={name} required maxLength={60} autoComplete="name" />
      </div>

      <div>
        <label className="zq-label" htmlFor="acct_username">
          Username
        </label>
        <div className="zq-input-at">
          <span aria-hidden="true">@</span>
          <input
            className="zq-input"
            id="acct_username"
            name="username"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            required
            maxLength={39}
            autoComplete="username"
            spellCheck={false}
          />
        </div>
        {changing && (
          <div className="zq-warn-box" role="note" style={{ marginTop: 10, marginBottom: 0 }}>
            <span className="ic" aria-hidden="true">
              !
            </span>
            <span>
              Your connection URLs, tool and policy names, and public links change to @{next}. Old links with @{current} keep working and lead
              here, and nobody else can take @{current}. Update the URLs saved in your agents when you can.
            </span>
          </div>
        )}
      </div>

      {(state?.error || pictureError) && (
        <div className="zq-warn-box" role="alert" style={{ marginBottom: 0 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{state?.error || pictureError}</span>
        </div>
      )}
      {state?.saved && !pending && (
        <div className="zq-ok-box" role="status" style={{ marginBottom: 0 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>{state.renamedFrom ? `Saved. You're @${current} now. Links with @${state.renamedFrom} still lead here.` : "Saved."}</span>
        </div>
      )}

      <div>
        <button type="submit" className="zq-action zq-action-primary" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
