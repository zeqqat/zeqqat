import { PolicyPageView } from "../../../../../components/PolicyPage";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccountPolicyPage({ params, searchParams }: Params) {
  return <PolicyPageView id={(await params).id} query={await searchParams} scope="account" />;
}
