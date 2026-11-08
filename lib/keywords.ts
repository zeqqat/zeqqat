import { and, countDistinct, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { callLog, endpointKeywordHit } from "../db/schema";
import { newId } from "./id";
import type { McpContext } from "./mcp-auth";
import { newWordsFor, type Candidate } from "./search-rank";
import { builtinToolName } from "./tool-names";

// Keywords learned from use (schema: endpoint_keyword_hit). When an agent
// searches, misses a tool, and then runs that tool in the same request,
// the search's new plain words are recorded against the tool. Once
// KEYWORD_MIN_REQUESTS different requests used a word for a tool,
// zeqqat_search matches it. Keywords only change what search finds; they
// are never shown to agents, so nothing learned here can put words in a
// model's mouth. Summaries, which models do read, go through a person
// (lib/feedback.ts).

export const KEYWORD_MIN_REQUESTS = 2;
const MAX_WORDS_PER_RUN = 8;
const SEARCH = builtinToolName("search");

// Active keywords per endpoint id.
export async function activeKeywords(endpointIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (endpointIds.length === 0) return out;
  const rows = await db
    .select({ endpointId: endpointKeywordHit.apiEndpointId, word: endpointKeywordHit.word, n: countDistinct(endpointKeywordHit.requestId) })
    .from(endpointKeywordHit)
    .where(inArray(endpointKeywordHit.apiEndpointId, endpointIds))
    .groupBy(endpointKeywordHit.apiEndpointId, endpointKeywordHit.word);
  for (const r of rows) {
    if (Number(r.n) < KEYWORD_MIN_REQUESTS) continue;
    out.set(r.endpointId, [...(out.get(r.endpointId) ?? []), r.word]);
  }
  return out;
}

// Endpoint ids that have an active keyword among these words: lets the
// search prefilter find a tool by a learned word alone.
export async function endpointsWithKeywords(words: string[]): Promise<string[]> {
  if (words.length === 0) return [];
  const rows = await db
    .select({ endpointId: endpointKeywordHit.apiEndpointId, word: endpointKeywordHit.word, n: countDistinct(endpointKeywordHit.requestId) })
    .from(endpointKeywordHit)
    .where(inArray(endpointKeywordHit.word, words))
    .groupBy(endpointKeywordHit.apiEndpointId, endpointKeywordHit.word);
  return [...new Set(rows.filter((r) => Number(r.n) >= KEYWORD_MIN_REQUESTS).map((r) => r.endpointId))];
}

type SearchLog = { query?: unknown };
type SearchResult = { matches?: { operationId?: string; integration?: string }[] } | null;

// Called after a successful zeqqat_run. Never throws: learning is a side
// effect and must not fail the call.
export async function learnFromRun(
  ctx: McpContext,
  endpoint: Candidate & { id: string; integrationRef: string },
): Promise<void> {
  if (!ctx.requestId) return;
  try {
    const searches = await db
      .select({ args: callLog.requestArgs, result: callLog.responseBody })
      .from(callLog)
      .where(and(eq(callLog.requestId, ctx.requestId), eq(callLog.toolName, SEARCH), eq(callLog.outcome, "ok")));
    const known = (await activeKeywords([endpoint.id])).get(endpoint.id) ?? [];
    const tool = { ...endpoint, keywords: known };
    const learned = new Set<string>();
    for (const s of searches) {
      const query = (s.args as SearchLog | null)?.query;
      if (typeof query !== "string" || !query.trim()) continue;
      const found = ((s.result as SearchResult)?.matches ?? []).some(
        (m) => m.operationId === endpoint.name && (!m.integration || m.integration === endpoint.integrationRef),
      );
      if (found) continue;
      for (const w of newWordsFor(query, tool)) learned.add(w);
    }
    const words = [...learned].slice(0, MAX_WORDS_PER_RUN);
    if (words.length === 0) return;
    await db
      .insert(endpointKeywordHit)
      .values(words.map((word) => ({ id: newId(), apiEndpointId: endpoint.id, word, requestId: ctx.requestId!, organizationId: ctx.organizationId })))
      .onConflictDoNothing();
  } catch (err) {
    console.warn("[zeqqat] keyword learning skipped:", (err as Error).message);
  }
}
