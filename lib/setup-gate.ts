// Until a workspace has its first Dokploy, its admin can open only the
// overview (which is the connect screen then) and Releases. Their own
// profile (/account) and the account level (/<username>/...) aren't about
// one workspace's Dokploy, so they stay open too (components/AppShell.tsx
// only gates workspace pages). Everything else in a workspace is about a
// Dokploy that isn't there yet, so the side menu asks them to connect first
// instead of opening an empty page.
// components/AppFrame.tsx decides who is gated.
//
// `rel` is the path inside the workspace: "" for /<username>/<workspace>,
// "/releases" for its Releases page (lib/paths.ts).
const OPEN_WITHOUT_DOKPLOY = ["/releases"];

export function openWithoutDokploy(rel: string): boolean {
  const path = rel.replace(/\/+$/, "");
  if (path === "") return true;
  return OPEN_WITHOUT_DOKPLOY.some((p) => path === p || path.startsWith(`${p}/`));
}
