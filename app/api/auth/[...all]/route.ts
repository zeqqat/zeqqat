import { authForRequest } from "../../../../lib/auth";

// Verified necessary the hard way: without this, Next.js caches the OAuth
// callback GET response, and the session cookie it sets never reliably
// reaches the browser.
export const dynamic = "force-dynamic";

// Same as toNextJsHandler, but each request goes to the sign-in setup for
// the scheme it arrived on (http or https, lib/auth-scheme.ts).
export const GET = (req: Request) => authForRequest(req.headers).handler(req);
export const POST = (req: Request) => authForRequest(req.headers).handler(req);
