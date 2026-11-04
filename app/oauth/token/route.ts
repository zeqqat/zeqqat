import { exchangeAuthorizationCode, refreshAccessToken, OAuthError } from "../../../lib/oauth";
import { clientIp, rateLimit } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return typeof body === "object" && body ? (body as Record<string, string>) : {};
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries()) as Record<string, string>;
}

export async function POST(request: Request) {
  if (!(await rateLimit(`token:${clientIp(request.headers)}`, 30, 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const params = await readParams(request);
  const grantType = params.grant_type;

  try {
    if (grantType === "authorization_code") {
      const { code, client_id: clientId, redirect_uri: redirectUri, code_verifier: codeVerifier } = params;
      if (!code || !clientId || !redirectUri || !codeVerifier) {
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }
      const tokens = await exchangeAuthorizationCode({ code, clientId, redirectUri, codeVerifier, resource: params.resource });
      return Response.json(tokens);
    }

    if (grantType === "refresh_token") {
      const { refresh_token: refreshToken, client_id: clientId } = params;
      if (!refreshToken || !clientId) {
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }
      const tokens = await refreshAccessToken({ refreshToken, clientId });
      return Response.json(tokens);
    }

    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json({ error: err.code, error_description: err.message }, { status: 400 });
    }
    throw err;
  }
}
