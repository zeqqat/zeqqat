import { AuthCard } from "../../components/AuthCard";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; next?: string | string[] }> }) {
  const { error, next } = await searchParams;
  return <AuthCard error={error} next={next} />;
}
