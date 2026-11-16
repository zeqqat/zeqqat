import type { Metadata } from "next";
import { SiteFooter, SiteHeader, SITE_LINKS } from "../../components/SiteChrome";
import { pageMeta, SITE_URL } from "../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "About",
  description: "Zeqqat is built by Gaita. He writes the blog, mostly from what he did on his own Dokploy server.",
  path: "/about",
});

// Who is behind Zeqqat. Search engines and readers both look for a real
// person behind a product and its posts; blog bylines link here.
// Public copy rule: say what he builds, never "founder", "solo" or where he
// lives, and never promise features Zeqqat doesn't have today.
// zq-steps numbers its items; these are short lines, not steps.
const PLAIN = { listStyle: "none", paddingLeft: 0 } as const;

export default function About() {
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Gaita",
    url: `${SITE_URL}/about`,
    sameAs: [SITE_LINKS.github],
    worksFor: { "@type": "Organization", name: "Zeqqat", url: SITE_URL },
  };
  return (
    <div className="zq">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(person).replace(/</g, "\\u003c") }}
      />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">About</p>
        <h1 className="zq-h">
          I&rsquo;m Gaita, building Zeqqat<span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          Zeqqat is the MCP gateway for Dokploy. You connect your Dokploy once, and Claude or any other agent can run
          it for you, with permissions you set and without ever seeing your secrets.
        </p>

        <section className="zq-block">
          <h2 className="zq-block-t">The blog</h2>
          <ul className="zq-steps" style={PLAIN}>
            <li>
              I write every post on the <a href={SITE_LINKS.blog}>blog</a>. Most of them are things I did on my own
              Dokploy server, with the real numbers.
            </li>
          </ul>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">The code</h2>
          <ul className="zq-steps" style={PLAIN}>
            <li>
              Zeqqat is free and open source. Self-host it or use zeqqat.com. The code is on{" "}
              <a href={SITE_LINKS.github} rel="noreferrer noopener">GitHub</a>.
            </li>
          </ul>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">Talk to me</h2>
          <ul className="zq-steps" style={PLAIN}>
            {SITE_LINKS.discord ? (
              <li>
                <a href={SITE_LINKS.discord} rel="noreferrer noopener">Discord</a>, where I answer questions about
                Zeqqat and Dokploy.
              </li>
            ) : null}
            <li>
              <a href={SITE_LINKS.x} rel="noreferrer noopener">X</a>, for what I ship.
            </li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
