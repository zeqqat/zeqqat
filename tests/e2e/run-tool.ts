import { readFileSync } from "node:fs";
import { join } from "node:path";

// The run tool for a Dokploy operationId, from the bundled kinds, so flow
// scripts call the same tool an agent would (zeqqat_read, zeqqat_create, ...).
const raw = JSON.parse(readFileSync(join(__dirname, "../../catalog/dokploy/kinds.json"), "utf8")) as {
  kinds: Record<string, string | { kind: string }>;
};
export function runToolOf(operationId: string): string {
  const k = raw.kinds[operationId];
  const kind = typeof k === "string" ? k : (k?.kind ?? "delete");
  return `zeqqat_${kind}`;
}
