import type { Metadata } from "next";
import GatewayLanding from "@/components/gateway-landing";

export const metadata: Metadata = {
  title: { absolute: "Zeqqat Gateway" },
};

export default function Page() {
  return <GatewayLanding />;
}
