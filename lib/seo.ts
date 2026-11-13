import type { Metadata } from "next";
import { SITE_URL } from "./blog";

export { SITE_URL };

// The share image every public page falls back to (app/opengraph-image.tsx).
export const DEFAULT_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Zeqqat: the safe MCP for Dokploy" };

type PageMeta = {
  // Shown as "<title> | Zeqqat" unless `absolute` is set.
  title: string;
  absolute?: boolean;
  description: string;
  // The page's own path, e.g. "/docs/self-host". Becomes the canonical URL.
  path: string;
  image?: { url: string; width: number; height: number; alt: string };
  type?: "website" | "article";
  publishedTime?: string;
};

// Metadata for one public page: its own title, description, canonical URL
// and share card. A page that sets `openGraph` replaces the root layout's
// whole object, so everything a share card needs is set here in one place.
export function pageMeta(p: PageMeta): Metadata {
  const full = p.absolute ? p.title : `${p.title} | Zeqqat`;
  const image = p.image ?? DEFAULT_OG_IMAGE;
  return {
    title: p.absolute ? { absolute: p.title } : p.title,
    description: p.description,
    // Every public page points feed readers (and crawlers) at the blog feed.
    alternates: { canonical: p.path, types: { "application/rss+xml": [{ url: "/rss.xml", title: "Zeqqat blog" }] } },
    openGraph: {
      type: p.type ?? "website",
      url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
      siteName: "Zeqqat",
      title: full,
      description: p.description,
      images: [image],
      ...(p.publishedTime ? { publishedTime: p.publishedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: full, description: p.description, images: [image.url] },
  };
}

// Sign-in, password and invite pages: reachable, but nothing a search
// result should land on.
export const NOINDEX: Metadata["robots"] = { index: false, follow: true };
