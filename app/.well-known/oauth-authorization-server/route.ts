import { publicUrl } from "../../../lib/env";

export const dynamic = "force-dynamic";

// RFC 8414. Sign-in happens immediately when the user hits /oauth/authorize
// (no deferred/device flow), matching the "Sign in when the browser opens"
// promise on the landing page (spec section 7's "OAuth metadata mode" note).
export async function GET() {
  const base = publicUrl();
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // No registration_endpoint: DCR is dropped in favor of CIMD. Both
    // conditions below must hold for Claude to select CIMD over DCR — the
    // second because a CIMD client authenticates as public (no secret) at
    // the token endpoint, which is already true for every client here.
    client_id_metadata_document_supported: true,
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}
