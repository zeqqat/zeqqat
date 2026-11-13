import { headers } from "next/headers";
import { authForRequest } from "./auth";

export async function getServerSession() {
  const h = await headers();
  return authForRequest(h).api.getSession({ headers: h });
}
