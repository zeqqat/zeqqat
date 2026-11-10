import type { Metadata } from "next";
import { AuthCard } from "../../components/AuthCard";
import { NOINDEX } from "../../lib/seo";

// Not for search results: the landing page is where people should arrive.
export const metadata: Metadata = { title: "Sign in", robots: NOINDEX };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; next?: string | string[] }> }) {
  const { error, next } = await searchParams;
  return <AuthCard error={error} next={next} />;
}
