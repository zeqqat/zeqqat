import { AuthCard } from "../../components/AuthCard";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthCard error={error} />;
}
