// The public list of apps on /integrations and the landing page.
//
// "ready": bundled with every Zeqqat (catalog/<slug>/), tools classified by
// hand. "spec": the app publishes an OpenAPI 3 spec that Zeqqat's importer
// reads as is; adding it takes the spec link and nothing else. Every spec
// entry here was run through the importer (parseSpec + convertOpenApi) and
// its tool count is what that produced. Don't list an app without doing
// that: a spec over 15 MB, a Swagger 2 file or a GraphQL-only API won't
// import, and listing it would promise something Zeqqat can't do.

export type DirectoryApp = {
  slug: string;
  name: string;
  // A single-colour logo in /public/logos, drawn as a mask in the text colour.
  logo: string;
  status: "ready" | "spec";
  blurb: string;
  // Tools Zeqqat makes from the spec (approximate for spec apps: the spec
  // changes upstream).
  tools: number;
  specUrl: string;
  docsUrl: string;
  // Who published the integration agents use, for "ready" apps.
  publishedAs?: string;
};

export const DIRECTORY: DirectoryApp[] = [
  {
    slug: "dokploy",
    name: "Dokploy",
    logo: "/logos/dokploy.svg",
    status: "ready",
    blurb: "Deploy apps, databases and compose stacks on your own servers.",
    tools: 554,
    specUrl: "https://raw.githubusercontent.com/Dokploy/dokploy/canary/openapi.json",
    docsUrl: "https://docs.dokploy.com/docs/api",
    publishedAs: "@zeqqat/dokploy",
  },
  {
    slug: "coolify",
    name: "Coolify",
    logo: "/logos/coolify.svg",
    status: "spec",
    blurb: "Self-hosted deploys: applications, databases, servers and services.",
    tools: 330,
    specUrl: "https://raw.githubusercontent.com/coollabsio/coolify/v4.x/openapi.json",
    docsUrl: "https://coolify.io/docs",
  },
  {
    slug: "stripe",
    name: "Stripe",
    logo: "/logos/stripe.svg",
    status: "spec",
    blurb: "Payments, customers, subscriptions, invoices and refunds.",
    tools: 612,
    specUrl: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    docsUrl: "https://docs.stripe.com/api",
  },
  {
    slug: "github",
    name: "GitHub",
    logo: "/logos/github.svg",
    status: "spec",
    blurb: "Repositories, issues, pull requests, actions and releases.",
    tools: 1272,
    specUrl: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    docsUrl: "https://docs.github.com/en/rest",
  },
  {
    slug: "resend",
    name: "Resend",
    logo: "/logos/resend.svg",
    status: "spec",
    blurb: "Send email, manage domains, audiences and contacts.",
    tools: 142,
    specUrl: "https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml",
    docsUrl: "https://resend.com/docs",
  },
];

// Where "Add to Zeqqat" goes: the dashboard's import form, filled in.
export function addAppPath(app: DirectoryApp): string {
  if (app.status === "ready") return "/app/integrations?add=1";
  const q = new URLSearchParams({ add: "app", spec: app.specUrl, docs: app.docsUrl, name: app.name });
  return `/app/integrations?${q.toString()}`;
}
