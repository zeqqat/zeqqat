// A steady colour per username, for avatars without a picture.
const COLORS = ["#2e6fe0", "#1e9e82", "#b5531d", "#7a4fd6", "#c9423a", "#0f8aa8", "#8a6d12"];

export function colorOf(slug: string) {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
