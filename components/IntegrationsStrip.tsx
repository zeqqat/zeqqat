import { DIRECTORY } from "../lib/integrations-directory";
import { AppLogo } from "./AppLogo";

// The landing page's row of app logos. Each one opens its card on
// /integrations; the last tile says the list isn't the limit.
export function IntegrationsStrip() {
  return (
    <section className="zq-works" aria-labelledby="zq-works-h">
      <h2 id="zq-works-h" className="zq-works-h">
        Works with
      </h2>
      <ul className="zq-works-row">
        {DIRECTORY.map((app) => (
          <li key={app.slug}>
            <a className="zq-works-item" href={`/integrations#${app.slug}`} title={app.name}>
              <AppLogo src={app.logo} size={22} />
              <span>{app.name}</span>
            </a>
          </li>
        ))}
        <li>
          <a className="zq-works-item zq-works-any" href="/integrations#any">
            <span className="zq-works-plus" aria-hidden="true">
              +
            </span>
            <span>Any OpenAPI</span>
          </a>
        </li>
      </ul>
      <a className="zq-works-all" href="/integrations">
        See all integrations <span aria-hidden="true">&rarr;</span>
      </a>
    </section>
  );
}
