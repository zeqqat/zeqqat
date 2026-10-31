import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getPost, getPostSlugs, formatDate, SITE_URL } from "@/lib/blog";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: { absolute: post.seoTitle },
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url,
      siteName: "Zeqqat",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
    },
    twitter: { card: "summary", title: post.title, description: post.description },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const url = `${SITE_URL}/blog/${post.slug}`;
  const others = getAllPosts().filter((p) => p.slug !== post.slug);

  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      mainEntityOfPage: url,
      url,
      keywords: post.keywords.join(", "),
      author: { "@type": "Organization", name: "Zeqqat", url: SITE_URL },
      publisher: { "@type": "Organization", name: "Zeqqat", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 2, name: post.title, item: url },
      ],
    },
  ];
  if (post.faqs.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <p className="bl-kicker">
        <Link href="/blog">Blog</Link>
      </p>
      <h1 className="bl-h1">{post.title}</h1>
      <p className="bl-meta">
        <time dateTime={post.date}>{formatDate(post.date)}</time> · {post.readingMinutes} min read
      </p>
      <div className="bl-prose" dangerouslySetInnerHTML={{ __html: post.html }} />
      {others.length > 0 && (
        <nav className="bl-more" aria-label="More posts">
          <h2>Keep reading</h2>
          <ul>
            {others.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  );
}
