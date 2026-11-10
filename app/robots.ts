import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/blog";

// Everything public may be crawled. Signed-in pages and the API answer a
// crawler with a sign-in redirect or a 401, so they need no rule here, and
// the sign-in pages carry a noindex tag instead (a page blocked here can
// still be listed if another site links to it).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
