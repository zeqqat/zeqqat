import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts, formatDate, SITE_URL } from "@/lib/blog";

export const metadata: Metadata = {
  title: { absolute: "Zeqqat Blog: Dokploy, Self-Hosting and MCP" },
  description:
    "Guides for self-hosters running Dokploy and Coolify, and for anyone connecting AI agents to their own servers with MCP.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/blog`,
    siteName: "Zeqqat",
    title: "Zeqqat Blog: Dokploy, Self-Hosting and MCP",
    description:
      "Guides for self-hosters running Dokploy and Coolify, and for anyone connecting AI agents to their own servers with MCP.",
  },
};

export default function BlogIndex() {
  const posts = getAllPosts();
  return (
    <>
      <p className="bl-kicker">Zeqqat blog</p>
      <h1 className="bl-h1">Self-hosting, Dokploy and AI agents</h1>
      <p className="bl-lede">
        Practical guides for people who run their own servers and want AI agents to help without
        handing over the keys to everything.
      </p>
      <ul className="bl-list">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="bl-card">
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              <time dateTime={post.date}>
                {formatDate(post.date)} · {post.readingMinutes} min read
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
