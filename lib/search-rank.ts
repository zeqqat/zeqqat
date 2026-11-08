// Pure ranking for zeqqat_search: no database, so it is unit tested
// directly (tests/unit/search-rank.test.ts).
//
// A query is split into words; each word matches a tool when it starts one
// of the tool's own words (in its operationId, summary, path, tags or
// learned keywords), so "deploying" finds application.deploy and "logs"
// finds deployment.readLogs, while "all" does not match "install". Tools
// are ranked by how many query words they match, then by where they match.

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how", "i", "if", "in", "into",
  "is", "it", "its", "me", "my", "of", "on", "or", "our", "please", "so", "that", "the", "their", "them", "this",
  "to", "up", "via", "was", "what", "when", "where", "which", "who", "why", "will", "with", "you", "your",
]);

// The verbs agents use and the words APIs use for them. Dokploy names its
// list calls "all" and its get calls "one".
const SYNONYMS: Record<string, string[]> = {
  list: ["all", "search"],
  get: ["one"],
  fetch: ["one"],
  show: ["one", "all"],
  find: ["search"],
  remove: ["delete"],
  restart: ["reload", "redeploy"],
};

// Light stemming, so plurals and -ing forms meet the base word.
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es") && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// Splits text into lowercase words, breaking camelCase and any
// non-alphanumeric run: "deployment.allByType" → deployment, all, by, type.
export function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// direct: the word itself and its stem. synonyms: the API's words for it
// (list → all), which count for a little less than a direct match.
export type QueryWord = { word: string; direct: string[]; synonyms: string[] };

// The meaningful words of a query, in order, each with the forms that may
// match it.
export function queryWords(query: string): QueryWord[] {
  const seen = new Set<string>();
  const out: QueryWord[] = [];
  for (const w of words(query)) {
    if (STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    const direct = [...new Set([w, stem(w)])].filter((v) => v.length >= 2);
    const synonyms = [...new Set([...(SYNONYMS[w] ?? []), ...(SYNONYMS[stem(w)] ?? [])])].filter((v) => !direct.includes(v));
    out.push({ word: w, direct, synonyms });
  }
  return out;
}

// Every string a SQL prefilter should look for (ILIKE %v%); ranking
// below then keeps only real word matches.
export function prefilterTerms(qw: QueryWord[]): string[] {
  return [...new Set(qw.flatMap((q) => [...q.direct, ...q.synonyms]))];
}

export type Candidate = {
  name: string;
  summary: string | null;
  path: string;
  tags: string[];
  keywords: string[];
};

const WEIGHTS = { name: 4, keyword: 3, summary: 2, tags: 1, path: 1 } as const;

function fieldWords(c: Candidate) {
  return {
    name: words(c.name),
    keyword: c.keywords.flatMap(words),
    summary: words(c.summary ?? ""),
    tags: c.tags.flatMap(words),
    path: words(c.path),
  };
}

const hits = (tokens: string[], variants: string[]) => tokens.some((t) => variants.some((v) => t.startsWith(v)));

// How well one query word matches one field: 1 for a whole word, 0.8 for a
// word start ("deploy" in "deployment"), each scaled down for a synonym.
function fieldMatch(tokens: string[], q: QueryWord): number {
  let best = 0;
  for (const [variants, factor] of [
    [q.direct, 1],
    [q.synonyms, 0.75],
  ] as const) {
    for (const t of tokens) {
      for (const v of variants) {
        if (t === v) best = Math.max(best, factor);
        else if (t.startsWith(v)) best = Math.max(best, 0.8 * factor);
      }
    }
  }
  return best;
}

export type Ranked<T> = { item: T; matched: number; score: number };

// Ranks candidates; drops those that match no query word. Sorted by how
// many query words matched, then by score: where each word matched
// (operationId over keywords over summary over path and tags), how
// exactly, and how early it came in the query (people put the thing they
// want first: "list projects with applications" is about projects). Ties
// go to the shorter operationId, the more general tool.
export function rank<T extends Candidate>(qw: QueryWord[], candidates: T[]): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const c of candidates) {
    const f = fieldWords(c);
    let matched = 0;
    let score = 0;
    qw.forEach((q, i) => {
      let best = 0;
      for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
        best = Math.max(best, WEIGHTS[key] * fieldMatch(f[key], q));
      }
      if (best) {
        matched++;
        score += best * Math.max(0.5, 1 - 0.1 * i);
      }
    });
    if (matched) out.push({ item: c, matched, score });
  }
  return out.sort(
    (a, b) =>
      b.matched - a.matched ||
      b.score - a.score ||
      words(a.item.name).length - words(b.item.name).length ||
      a.item.name.localeCompare(b.item.name),
  );
}

// Query words that do not already describe this tool: the ones worth
// learning as keywords when an agent searched with them, missed, and then
// ran the tool. Only plain words are kept: letters only, 3 to 20 long,
// lowercase after an optional capital, and not glued to anything by a
// hyphen, dot or underscore. App names (my-app), ids (M5SntWCbl) and
// anything with digits never become keywords.
export function newWordsFor(query: string, c: Candidate): string[] {
  const f = fieldWords(c);
  const known = [...f.name, ...f.summary, ...f.keyword, ...f.tags, ...f.path];
  const plain = query
    .split(/[\s,;:!?()"']+/)
    .filter((t) => /^[A-Za-z][a-z]{2,19}$/.test(t))
    .join(" ");
  return [
    ...new Set(
      queryWords(plain)
        .filter((q) => !hits(known, [...q.direct, ...q.synonyms]))
        .map((q) => stem(q.word)),
    ),
  ];
}
