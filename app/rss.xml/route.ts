import { getAllPosts, SITE_URL } from "@/lib/blog";

// The blog as an RSS feed: for readers, and for Google, which takes a feed
// as a second sitemap and checks it more often, so new posts are found
// sooner. Built from the same posts as /blog, newest first.
export const dynamic = "force-static";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toUTCString();
}

export function GET() {
  const posts = getAllPosts().filter((p) => p.date);
  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`;
      return [
        "    <item>",
        `      <title>${esc(p.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${rfc822(p.date)}</pubDate>`,
        `      <description>${esc(p.description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  const newest = posts[0]?.updated || posts[0]?.date;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Zeqqat blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Guides for self-hosters running Dokploy and Coolify, and for anyone connecting AI agents to their own servers with MCP.</description>
    <language>en</language>
${newest ? `    <lastBuildDate>${rfc822(newest)}</lastBuildDate>\n` : ""}${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
