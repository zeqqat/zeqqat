# lib/

## Tool names

Built-in tools (`zeqqat_search`, `zeqqat_run`, ...) are the only names an MCP client ever validates; build them with `builtinToolName`. Catalog tools are called by operationId plus instance through `zeqqat_run`; their human-facing name is the canonical `@org/target.type.action`, and a tool page URL is `/<org>/<target.type.action>`.

- Segments are lowercase snake_case: no uppercase, no leading, trailing or doubled underscores. Org slugs follow the same rule (`lib/username.ts`).
- `type` is `http` or `workflow`. Never reintroduce `core`.
- Catalog names have no length budget and no hash: they never reach a client's name check.
- `compileEndpointName` gives an importer the `action` and canonical name; agents use the raw operationId (`api_endpoint.name`).

**Why:** Claude's web and desktop clients silently drop any listed tool whose name (as `mcp__<connector>__<name>`) has characters outside `A-Z a-z 0-9 _ -` or is over 64 characters. The connector then shows as connected with zero tools.

All naming logic lives in `tool-names.ts`. Never build a tool name by hand anywhere else.

## Tool results

`lib/mcp-context.ts` builds the context object; `shapeResult` in `mcp-server.ts` puts it in front of every result. Built-in tools return `toolOk(data, text)` or `toolError(text)` (`executor.ts`) and never build MCP results themselves.

## Connection URLs

`/<org>/mcp/<name>/<shortId>`. Pure path rules (no database) live in `connection-paths.ts` so `proxy.ts` can use them; everything that touches the database is in `connections.ts`. Never hand-build a connection URL: use `connectionPath` / `connectionUrl`.
