import type { MetadataRoute } from "next";
import { DOC_PAGES } from "@/lib/agent-docs";
import { getAllPosts, SITE_URL } from "@/lib/blog";
import { BUNDLED } from "@/lib/changelog";
import { lastmodOf, readLastmod } from "@/lib/lastmod";

// Every public page a search result should land on: the landing page, the
// docs, the self-host guide, releases, the blog and the legal pages. The
// dashboard needs a sign-in and stays out, and so do the sign-in pages.
//
// lastModified is the date the page itself last changed, never the build
// date: a post has its own date (or `updated`), /releases changes with every
// release, and every other page's date comes from content/lastmod.json.
export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const postDate = (p: { date: string; updated?: string }) => {
    const d = p.updated || p.date;
    return d ? new Date(`${d}T00:00:00Z`) : undefined;
  };
  const newestPost = posts
    .map(postDate)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const released = BUNDLED[0]?.date ? new Date(`${BUNDLED[0].date}T00:00:00Z`) : undefined;
  const lastmod = readLastmod();
  const at = (path: string) => lastmodOf(path, lastmod);
  return [
    { url: `${SITE_URL}/`, lastModified: at("/"), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/docs`, lastModified: at("/docs"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/docs/self-host`, lastModified: at("/docs/self-host"), changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/docs/agents`, lastModified: at("/docs/agents"), changeFrequency: "weekly", priority: 0.8 },
    ...DOC_PAGES.map((p) => ({
      url: `${SITE_URL}/docs/agents/${p.id}`,
      lastModified: at(`/docs/agents/${p.id}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/blog`, lastModified: newestPost, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: postDate(post),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/releases`, lastModified: released, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, lastModified: at("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, lastModified: at("/privacy"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
