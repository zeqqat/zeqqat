import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";

export const SITE_URL = "https://zeqqat.com";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export type PostMeta = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  date: string;
  keywords: string[];
};

export type Faq = { question: string; answer: string };

export type Post = PostMeta & {
  html: string;
  faqs: Faq[];
  readingMinutes: number;
};

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    data[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return { data, body: match[2] };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// FAQ answers come from the "## FAQ" section: each "### Question" followed by its paragraph(s).
function extractFaqs(body: string): Faq[] {
  const section = body.split(/^## FAQ\s*$/m)[1];
  if (!section) return [];
  const until = section.split(/^## /m)[0];
  return until
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const [first, ...rest] = chunk.split("\n");
      return { question: first.trim(), answer: stripMarkdown(rest.join(" ")) };
    })
    .filter((f) => f.question && f.answer);
}

function renderMarkdown(body: string): string {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        if (depth === 1) return `<h2>${text}</h2>\n`;
        return `<h${depth} id="${slugify(text)}">${text}</h${depth}>\n`;
      },
      table(token) {
        // Wrap tables so they scroll sideways on phones instead of breaking the layout.
        const html = marked.Renderer.prototype.table.call(this, token);
        return `<div class="bl-table">${html}</div>\n`;
      },
    },
  });
  return marked.parse(body, { async: false }) as string;
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getPost(slug: string): Post | null {
  const file = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: data.title ?? slug,
    seoTitle: data.seoTitle ?? data.title ?? slug,
    description: data.description ?? "",
    date: data.date ?? "",
    keywords: (data.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
    html: renderMarkdown(body),
    faqs: extractFaqs(body),
    readingMinutes: Math.max(1, Math.round(words / 230)),
  };
}

export function getAllPosts(): Post[] {
  return getPostSlugs()
    .map((slug) => getPost(slug))
    .filter((p): p is Post => p !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
