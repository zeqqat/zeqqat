import { edition } from "../../../../lib/edition";
import { recordClaim } from "../../../../lib/selfhost-installs";

// A Zeqqat installed from zeqqat.com reports that its owner account was
// made, with only the claim token (lib/seed-claim.ts). zeqqat.com stops
// showing the claim link. Always 204: it tells the caller nothing.
export async function POST(req: Request) {
  if (edition() === "cloud") {
    try {
      const body = (await req.json()) as { token?: unknown };
      if (typeof body?.token === "string") await recordClaim(body.token);
    } catch {
      // ignore
    }
  }
  return new Response(null, { status: 204 });
}
