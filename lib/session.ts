import { headers } from "next/headers";
import { authForRequestAsync } from "./auth";

export async function getServerSession() {
  const h = await headers();
  return (await authForRequestAsync(h)).api.getSession({ headers: h });
}
