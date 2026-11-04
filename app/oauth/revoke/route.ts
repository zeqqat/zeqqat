import { revokeToken } from "../../../lib/oauth";
import { clientIp, rateLimit } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// RFC 7009. Always 200 regardless of whether the token existed — the
// response must not leak which tokens are valid.
export async function POST(request: Request) {
  if (!(await rateLimit(`revoke:${clientIp(request.headers)}`, 30, 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let token: string | undefined;
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    token = typeof body === "object" && body ? (body as Record<string, string>).token : undefined;
  } else {
    const form = await request.formData();
    token = form.get("token")?.toString();
  }

  if (token) await revokeToken(token);
  return new Response(null, { status: 200 });
}
