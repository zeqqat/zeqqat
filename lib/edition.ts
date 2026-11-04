import { publicUrl } from "./env";

// Which Zeqqat this is: the hosted one at zeqqat.com, or someone's own
// install on their Dokploy. Shown in the header on every page so a user
// always knows which one they're looking at. A fresh install is
// self-hosted; only the hosted deployment sets ZEQQAT_EDITION=cloud.
export type Edition = "cloud" | "self-hosted";

export function edition(): Edition {
  return process.env.ZEQQAT_EDITION === "cloud" ? "cloud" : "self-hosted";
}

export function siteHost(): string {
  try {
    return new URL(publicUrl()).host;
  } catch {
    return "zeqqat";
  }
}
