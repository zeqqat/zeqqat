import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppLogo } from "../../components/AppLogo";
import { CopyButton } from "../../components/CopyButton";
import { SiteFooter, SiteHeader } from "../../components/SiteChrome";
import { edition } from "../../lib/edition";
import { addAppPath, DIRECTORY, type DirectoryApp } from "../../lib/integrations-directory";
import { getServerSession } from "../../lib/session";

export const metadata: Metadata = {
  title: "Integrations | Zeqqat",
  description:
    "Apps you can give AI access to through Zeqqat: Dokploy out of the box, and Coolify, Stripe, GitHub, Resend or any other app from its OpenAPI spec.",
  alternates: { canonical: "/integrations" },
};

const nf = new Intl.NumberFormat("en-US");

// zeqqat.com's public list of apps. Signed-out visitors are sent through
// sign-in and land on the dashboard's import form with the app filled in.
export default async function IntegrationsPage() {
  if (edition() === "self-hosted") redirect("/app/integrations");
  const session = await getServerSession();
  const href = (app: DirectoryApp) => {
    const path = addAppPath(app);
    return session?.user ? path : `/signup?next=${encodeURIComponent(path)}`;
  };
  const ready = DIRECTORY.filter((a) => a.status === "ready");
  const bySpec = DIRECTORY.filter((a) => a.status === "spec");

  return (
    <div className="zq">
      <SiteHeader current="integrations" />
      <div className="zq-mid">
        <main className="zq-int">
          <h1 className="zq-int-h">Integrations</h1>
          <p className="zq-int-sub">
            Every app here becomes tools your agent can call through one Zeqqat connection. You pick what each agent
            may do, the keys stay with Zeqqat.
          </p>

          <section className="zq-int-sec" aria-labelledby="int-ready">
            <h2 id="int-ready" className="zq-int-sec-h">
              Ready to connect
            </h2>
            <p className="zq-int-sec-p">Built in, with every tool sorted by hand into read, create, edit and delete.</p>
            <div className="zq-int-grid">
              {ready.map((app) => (
                <AppCard key={app.slug} app={app} href={href(app)} />
              ))}
            </div>
          </section>

          <section className="zq-int-sec" aria-labelledby="int-spec">
            <h2 id="int-spec" className="zq-int-sec-h">
              Add from their OpenAPI spec
            </h2>
            <p className="zq-int-sec-p">
              These apps publish a spec Zeqqat reads as is. Adding one takes a click: it lands under your account as
              @you/&lt;app&gt;, and anything that looks destructive starts as delete, which no agent gets by default.
            </p>
            <div className="zq-int-grid">
              {bySpec.map((app) => (
                <AppCard key={app.slug} app={app} href={href(app)} />
              ))}
            </div>
          </section>

          <section className="zq-int-sec" id="any" aria-labelledby="int-any">
            <h2 id="int-any" className="zq-int-sec-h">
              Any other API
            </h2>
            <div className="zq-int-any">
              <p>
                If the app publishes an OpenAPI 3 spec (JSON or YAML), paste its link and Zeqqat turns every endpoint
                into a tool. Agents can do it too, with <code>zeqqat_import</code>.
              </p>
              <a className="zq-action zq-action-primary" href={session?.user ? "/app/integrations?add=app" : `/signup?next=${encodeURIComponent("/app/integrations?add=app")}`}>
                Add an app by its spec
              </a>
            </div>
          </section>

          <section className="zq-int-sec" aria-labelledby="int-mcp">
            <h2 id="int-mcp" className="zq-int-sec-h">
              MCP servers
            </h2>
            <div className="zq-int-any">
              <p>
                Putting your existing MCP servers behind Zeqqat, with the same permissions and activity log, is on the
                way. Follow along on <a href="https://github.com/zeqqat/zeqqat">GitHub</a>.
              </p>
            </div>
          </section>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

function AppCard({ app, href }: { app: DirectoryApp; href: string }) {
  return (
    <article className="zq-int-card" id={app.slug}>
      <div className="zq-int-card-top">
        <span className="zq-int-logo">
          <AppLogo src={app.logo} size={24} />
        </span>
        <div className="zq-int-card-name">
          <h3>{app.name}</h3>
          <span className="zq-int-meta">
            {app.status === "ready" ? (
              <>
                <span className="zq-int-pill">Ready</span> {nf.format(app.tools)} tools
              </>
            ) : (
              <>About {nf.format(app.tools)} tools</>
            )}
          </span>
        </div>
      </div>
      <p className="zq-int-blurb">{app.blurb}</p>
      {app.status === "spec" && (
        <div className="zq-int-spec">
          <code title={app.specUrl}>{new URL(app.specUrl).pathname.split("/").pop()}</code>
          <CopyButton text={app.specUrl} label="Copy spec link" />
        </div>
      )}
      <div className="zq-int-actions">
        <a className="zq-action zq-action-primary" href={href}>
          {app.status === "ready" ? `Connect ${app.name}` : `Add ${app.name}`}
        </a>
        <a className="zq-link" href={app.docsUrl} rel="noreferrer noopener">
          API docs
        </a>
      </div>
    </article>
  );
}
