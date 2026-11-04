import { AuthCard } from "../../components/AuthCard";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthCard error={error} />;
}
