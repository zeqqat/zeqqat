// Resolves local `$ref`s (`#/...`) against the document they live in.
//
// Written here rather than taken from json-schema-ref-parser because that
// library follows external refs by default, and an external `$ref` in an
// uploaded spec is a request to make this server fetch a URL or read a
// file of the uploader's choosing. Local refs are the only kind honored;
// anything else is left as an empty schema with a description saying why.
//
// A ref that leads back into itself (a tree node whose children are tree
// nodes) cannot be inlined, so the cyclic occurrence becomes `{}` with a
// description naming the target, per the spec. Siblings next to a `$ref`
// (allowed in 3.1) are merged over the resolved target.

//
// Big specs (Stripe's links almost every object to every other through
// expandable fields) blow up when every ref is inlined, even without a
// cycle. So inlining has a budget: refs nested deeper than MAX_DEPTH, or
// met after MAX_NODES values have been written, stay as a short stub
// naming the schema. The agent still sees the shape near the top.

export type DerefIssue = { kind: "circular" | "unresolved" | "truncated"; ref: string };

const MAX_DEPTH = 8;
const MAX_NODES = 20_000;

type Budget = { nodes: number };

export function resolvePointer(root: unknown, ref: string): unknown {
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) return undefined;
  let node: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
    if (node === undefined) return undefined;
  }
  return node;
}

export function deref(root: unknown, value: unknown, issues: DerefIssue[] = []): unknown {
  return walk(root, value, [], issues, { nodes: 0 });
}

function walk(root: unknown, value: unknown, stack: string[], issues: DerefIssue[], budget: Budget): unknown {
  budget.nodes++;
  if (Array.isArray(value)) return value.map((v) => walk(root, v, stack, issues, budget));
  if (value === null || typeof value !== "object") return value;

  const obj = value as Record<string, unknown>;
  if (typeof obj.$ref === "string") {
    const ref = obj.$ref;
    const { $ref: _ignored, ...siblings } = obj;
    void _ignored;

    if (stack.includes(ref)) {
      issues.push({ kind: "circular", ref });
      return { description: `Circular reference to ${ref} omitted.` };
    }
    if (stack.length >= MAX_DEPTH || budget.nodes > MAX_NODES) {
      issues.push({ kind: "truncated", ref });
      const name = ref.split("/").pop();
      return { type: "object", description: `${name} (nested schema not expanded)` };
    }
    const target = resolvePointer(root, ref);
    if (target === undefined) {
      issues.push({ kind: "unresolved", ref });
      return { description: `Unresolvable reference ${ref} omitted.` };
    }
    const resolved = walk(root, target, [...stack, ref], issues, budget);
    const rest = walk(root, siblings, stack, issues, budget) as Record<string, unknown>;
    if (Object.keys(rest).length === 0) return resolved;
    return resolved && typeof resolved === "object" && !Array.isArray(resolved)
      ? { ...(resolved as Record<string, unknown>), ...rest }
      : rest;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = walk(root, v, stack, issues, budget);
  return out;
}
