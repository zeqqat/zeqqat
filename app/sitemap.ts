import type { MetadataRoute } from "next";
import { DOC_PAGES } from "@/lib/agent-docs";
import { getAllPosts, SITE_URL } from "@/lib/blog";
import { BUNDLED } from "@/lib/changelog";

// Every public page a search result should land on: the landing page, the
// docs, the self-host guide, releases, the blog and the legal pages. The
// dashboard needs a sign-in and stays out, and so do the sign-in pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const newestPost = posts[0]?.date ? new Date(posts[0].date) : undefined;
  // The site changes with every release, so the newest release dates the
  // pages that have no date of their own.
  const released = BUNDLED[0]?.date ? new Date(BUNDLED[0].date) : undefined;
  return [
    { url: `${SITE_URL}/`, lastModified: released, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/docs/self-host`, lastModified: released, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/docs/agents`, lastModified: released, changeFrequency: "weekly", priority: 0.8 },
    ...DOC_PAGES.map((p) => ({
      url: `${SITE_URL}/docs/agents/${p.id}`,
      lastModified: released,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/blog`, lastModified: newestPost, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.date ? new Date(post.date) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/releases`, lastModified: released, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
