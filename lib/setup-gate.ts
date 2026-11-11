// Until a workspace has its first Dokploy, its admin can open only the
// overview (which is the connect screen then) and Releases. Everything else
// in the dashboard is about a Dokploy that isn't there yet, so the side menu
// asks them to connect first instead of opening an empty page.
// components/AppShell.tsx applies it; app/app/layout.tsx decides who is gated.
const OPEN_WITHOUT_DOKPLOY = ["/app/releases"];

export function openWithoutDokploy(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/app") return true;
  return OPEN_WITHOUT_DOKPLOY.some((p) => path === p || path.startsWith(`${p}/`));
}
