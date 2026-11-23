import { applyCloudKeyChoice, installByToken } from "../../../../lib/cloud-key";
import { edition } from "../../../../lib/edition";
import { recordClaim } from "../../../../lib/selfhost-installs";

// A Zeqqat installed from zeqqat.com asks zeqqat.com to keep or delete the
// key it holds for the instance (lib/cloud-key.ts). The owner chose on the
// install, right after signing in there; the claim token (which only the
// install and its owner have) is what proves it. Unknown tokens get a 404
// with nothing else.
export async function POST(req: Request) {
  if (edition() !== "cloud") return new Response(null, { status: 404 });
  let body: { token?: unknown; choice?: unknown; picked?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const choice = body.choice === "kept" || body.choice === "deleted" ? body.choice : null;
  const token = typeof body.token === "string" ? body.token : "";
  let row = await installByToken(token);
  if (!row || !choice) return new Response(null, { status: 404 });
  // Only an install that has its owner asks; its claim report may simply
  // not have arrived yet.
  if (!row.claimedAt) {
    await recordClaim(token);
    row = (await installByToken(token)) ?? row;
  }
  if (row.keyChoice) return Response.json({ ok: true, already: row.keyChoice });
  const r = await applyCloudKeyChoice(row, choice, typeof body.picked === "string" ? body.picked : undefined);
  return Response.json(r);
}
