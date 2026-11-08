import type { MetadataRoute } from "next";
import { getAllPosts, SITE_URL } from "@/lib/blog";

// Public pages only: the landing page, integrations and the blog. The
// dashboard needs a sign-in and stays out.
export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const newest = posts[0]?.date;
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/integrations`, changeFrequency: "weekly", priority: 0.9 },
    {
      url: `${SITE_URL}/blog`,
      lastModified: newest ? new Date(newest) : undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.date ? new Date(post.date) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
