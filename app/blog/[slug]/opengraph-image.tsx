import { getPost, getPostSlugs } from "@/lib/blog";
import { ogImage, OG_SIZE } from "@/lib/og-image";

export const alt = "Zeqqat blog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

// Each post's share card carries its own title.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  return ogImage({ label: "Zeqqat blog", title: post?.title ?? "Zeqqat blog" });
}
