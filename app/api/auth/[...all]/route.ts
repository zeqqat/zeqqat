import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../lib/auth";

// Verified necessary the hard way: without this, Next.js caches the OAuth
// callback GET response, and the session cookie it sets never reliably
// reaches the browser. Kept explicit rather than trusting that
// toNextJsHandler sets it internally.
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
