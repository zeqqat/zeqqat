import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicHeader } from "../../../../components/PublicHeader";
import { DOC_PAGES, sectionsOf } from "../../../../lib/agent-docs";

type Props = { params: Promise<{ page: string }> };

export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ page: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await params;
  return { title: DOC_PAGES.find((p) => p.id === page)?.title ?? "Docs" };
}

// One docs page: its sections, each with an anchor (#section) that
// zeqqat_docs passages link to.
export default async function AgentDocsPage({ params }: Props) {
  const { page } = await params;
  const meta = DOC_PAGES.find((p) => p.id === page);
  if (!meta) notFound();
  const sections = sectionsOf(page);
  const index = DOC_PAGES.findIndex((p) => p.id === page);
  const next = DOC_PAGES[index + 1];

  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">
          <a href="/docs/agents">Docs for agents</a>
        </p>
        <h1 className="zq-h">
          {meta.title}
          <span className="dot">.</span>
        </h1>
        {sections.map((s) => (
          <section className="zq-block" id={s.id} key={s.id}>
            <h2 className="zq-block-t">
              <a href={`#${s.id}`}>{s.title}</a>
            </h2>
            <p className="zq-note">{s.text}</p>
          </section>
        ))}
        {next && (
          <p className="zq-note">
            Next:{" "}
            <a className="zq-textlink" href={`/docs/agents/${next.id}`}>
              {next.title}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
