# app/mcp-internal/

The MCP side of every connection URL. `proxy.ts` rewrites POSTs on `/<org>/mcp/<name>/<id>` here and refuses direct requests to this path, so never link to it or call it.

- Every name `tools/list` returns must pass the naming rules in `lib/AGENTS.md`. `tests/regression/tools-list-names.test.ts` calls the real handler to enforce this, so a name added anywhere on that path is caught.
- The built-in tools (`zeqqat_search`, `zeqqat_describe`, `zeqqat_run`, `zeqqat_whoami`, `zeqqat_policy`, `zeqqat_docs`) are the only tools in `tools/list`. They are hardcoded in `lib/mcp-server.ts` and executed in-process by `lib/mcp-tools.ts`. Catalog tools are never listed: agents find them with `zeqqat_search` and call them through `zeqqat_run`.
- Every result carries the context object (`lib/mcp-context.ts`): first `content` block as JSON text, and `structuredContent.context`. Errors are text only, no `structuredContent`. `shapeResult` in `lib/mcp-server.ts` does this for every tool; don't build results anywhere else.
- The same context goes into `instructions` on both `initialize` and `server/discover` (clients that get a discover answer may never send initialize).
- A private built-in function must check the caller's permissions itself when it runs. Being left out of `tools/list` is not access control: any client can call any name.
- A connection that doesn't exist must get the exact same 401 as one called without a token. Don't add a 404 here.
