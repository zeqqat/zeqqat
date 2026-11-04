"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  className = "zq-copy",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access denied — nothing useful to do but leave the
          // button unchanged so the user can select the text manually.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
