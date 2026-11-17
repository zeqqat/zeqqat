// Which part of a version a newer release changed: 0 major, 1 minor,
// 2 patch. Null when the version is the latest, is newer than it, or
// either one can't be compared. The Dokploy Instances card underlines
// that part of the version pill (components/InstanceCards.tsx).
export function changedPart(version: string | null, latest: string | null): number | null {
  if (!version || !latest) return null;
  const a = version.replace(/^v/, "").split(/[.-]/);
  const b = latest.replace(/^v/, "").split(/[.-]/);
  if (a.length < 3 || b.length < 3) return null;
  for (let i = 0; i < 3; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    if (x !== y) return x < y ? i : null;
  }
  return null;
}
