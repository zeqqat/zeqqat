---
name: zeqqat
description: "Use when working through a Zeqqat MCP URL (tools named zeqqat_*) to call a person's apps such as Dokploy: how to find, describe and run tools, give reasons, and move secrets without seeing them."
---

# Using Zeqqat

Zeqqat is an MCP gateway. One MCP URL gives you access to the apps a person connected (for example Dokploy), on the servers (instances) they added. You never hold their API keys, and secrets in results reach you as handles, not values.

## Connect

Each MCP URL is shown in the Zeqqat dashboard under MCP URLs:

```
https://zeqqat.com/<username>/mcp/<name>/<id>
```

Self-hosted installs use their own domain in place of zeqqat.com. Sign-in is OAuth 2.1; each token works only on the MCP URL it was issued for. The `mcp.json` in this plugin carries a placeholder URL: replace it with the MCP URL from the dashboard.

## The flow

1. Call `zeqqat_whoami` first. It returns the context: the account that owns the MCP URL, the workspace, the apps this MCP URL reaches, their instances, and what is allowed on each.
2. `zeqqat_search` for the task (for example "deploy", "logs").
3. `zeqqat_describe` the tool you picked to see its inputs and outputs.
4. The run tool for the tool's kind (`zeqqat_read`, `zeqqat_create`, `zeqqat_edit` or `zeqqat_delete`; search says which) with the operationId, the instance name from the context, and inputs matching the schema. Only the kinds this MCP URL allows are listed.

Search, describe and run each need a `reason`: one line saying what the user asked you to do, worded exactly the same on every call for one request. A call without a reason is refused. People read these in the activity log.

## Permissions

Each instance either has a policy (an explicit allow list of tools) or allows whole kinds: read, create, edit, delete. `policySummary` in the context says what is allowed; `zeqqat_policy` returns the full list. A denied call was never sent: tell the user, and a workspace admin can change it in the dashboard.

## Secrets

- A secret in a result (a password, a token, `DATABASE_URL`) arrives as a handle like `{{zq_secret_ab12cd34ef56gh78}}`.
- To use it, put the handle in a later run tool input, alone or inside a string: `DATABASE_URL=postgresql://app:{{zq_secret_...}}@db:5432/app`. Zeqqat fills in the value just before the request goes out.
- For a new password or key, call `zeqqat_secret` and use the handle it returns everywhere that value is needed.
- Handles only work in env blocks and secret-named fields (password, token, key, secret), on the MCP URL and instance they came from, and expire after 30 minutes.
- Never ask the user to paste a secret into the chat.

## More

- `zeqqat_docs` answers questions about Zeqqat.
- `zeqqat_import` adds an app from a link to its OpenAPI spec.
- `zeqqat_feedback` suggests a better one-line summary for a tool when its summary made it hard to find. Call it after the task; the publisher reviews it.
- `zeqqat_check` tests from the internet whether an address loads (live, certificate_not_ready, error_page, unreachable) or a Dokploy server's port 22, 80, 443 or 3000 is open. Your sandbox can't tell; never say something is live without a `live` check.
- `zeqqat_activity` reads the audit log: recent requests in this workspace (who asked, which agent, what ran, what was blocked), or one request's calls with `request`. Use it when the user asks what you or another agent did.
- Agent docs: https://zeqqat.com/docs/agents
