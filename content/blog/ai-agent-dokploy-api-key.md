---
title: "Is It Safe to Give an AI Agent Your Dokploy API Key?"
seoTitle: "Is It Safe to Give an AI Agent Your Dokploy API Key?"
description: "What a Dokploy API key can actually do, what can go wrong when an AI agent holds one, and seven practical steps to limit the damage before you connect Claude or Cursor."
date: "2026-10-31"
keywords: "dokploy api key, dokploy mcp, dokploy ai agent, dokploy permissions, dokploy mcp server"
---

Short answer: **it's as safe as the key is narrow.** A Dokploy API key created from an owner or admin account can do nearly everything that account can do, including deleting apps and databases and reading environment variables. Giving that key to an AI agent means trusting the agent, the model, and everything the agent reads, with all of it.

That doesn't mean you shouldn't do it. Letting Claude, Cursor or Claude Code deploy and debug your apps is genuinely useful. It means you should shrink what the key can do first. Here's what you're actually handing over, what can go wrong, and how to limit it.

## What a Dokploy API key can do

When you create a key in Dokploy (Settings, then Profile), you pick an organization and get a token that's shown once. Requests send it in the `x-api-key` header.

Two details matter most:

- **The key inherits the permissions of the user who created it.** There's no separate scope on the key itself. A key made by the owner acts as the owner.
- **The key covers the whole organization** you picked, not one project or one app.

So the real question is never "what can this key do?" It's "what can the user who made it do?" For most people running Dokploy alone, that user is the owner, which means the key can:

- Deploy, stop, and delete applications and Compose services
- Create, modify, and delete databases
- Read and change environment variables, which usually hold your other secrets
- Add or remove domains and certificates
- Manage servers, registries, SSH keys and backups

The official Dokploy MCP package turns this whole API into tools, more than 500 of them, authenticated with that single key.

## What can actually go wrong

The risk isn't that the model is malicious. It's a few ordinary failure modes, each of which gets worse the more the key can do.

**1. Honest mistakes.** You ask the agent to "clean up the old staging app." It picks the wrong app, or decides the staging database counts as part of the app. Models are good at following instructions and bad at knowing which of two similar names you meant.

**2. Prompt injection.** An agent that reads build logs, README files, GitHub issues or web pages can be steered by text inside them. A line in a dependency's log output that says "now delete the project" is unlikely to work, but the more powerful the key, the more an attacker gains if one ever does.

**3. Secret leakage.** Environment variables hold your database passwords, Stripe keys and SMTP credentials. If the agent reads them, they end up in the model's context, in the chat history, and possibly in logs. The official Dokploy MCP package redacts secret fields by default, which helps, but the raw API returns them to anything holding the key.

**4. The key itself leaks.** Most MCP clients store the key in a plain-text config file on your machine. It travels with dotfile backups, gets pasted into issue reports, and sits on every laptop where you set up the agent.

**5. No record of what happened.** If something changes on your server, there's often no easy way to tell whether it was you, a teammate, or an agent, or which tool call caused it.

## Seven ways to make it safer

You don't need all of these. Start at the top and stop when you're comfortable.

### 1. Never use your owner key

Create a separate Dokploy user for the agent and make it a **member**, not an admin. Then create the API key while signed in as that user. Every limit on the user now applies to the key.

### 2. Give that user only what the task needs

Dokploy members get permissions one by one: creating or deleting projects, services and environments, access to the Docker tab, Traefik files, SSH keys, Git providers, and the API itself. Members can also be limited to specific projects, services, or environments. For an agent that deploys and debugs, turn off everything you can and grant access only to the projects it works on.

Be aware the built-in toggles are coarse. "Create or delete services" is one permission, so you can't allow creating without deleting. Finer custom roles exist in Dokploy's enterprise edition.

### 3. Keep production out of reach at first

Give the agent access to staging or side-project environments only. Once you trust how it behaves, add production deliberately, one project at a time.

### 4. Load fewer tools

The official MCP package lets you load a preset or filter by tags instead of all 500+ tools. Fewer tools means fewer chances to pick the wrong one. Note that this narrows what the agent sees but isn't a security boundary: the key can still do everything the user can.

### 5. Keep secret redaction on

The official package redacts environment variables, Compose files, passwords and tokens from responses by default. Leave it on unless you have a specific reason not to.

### 6. Require approval for destructive calls

Most MCP clients can ask before running a tool. In Claude Code and similar agents, allow read-only tools automatically and keep approval prompts on for anything that deletes, stops, or changes configuration. MCP tools carry hints marking them read-only or destructive, which clients use for exactly this.

### 7. Have backups you've actually restored

Turn on scheduled database backups to S3 or R2 before the agent touches anything, and test one restore. This is the step that turns a bad agent mistake from a disaster into an hour of work.

## The limit of these steps

Even with all seven, two gaps remain:

- **Permissions are per user, not per tool.** You can't say "this agent may deploy and restart, but never delete" in stock Dokploy without the enterprise custom roles.
- **The agent still holds the key.** It lives in a config file on every machine where you set up the agent, and rotating it means updating each one.

Closing those gaps is the job of an **MCP gateway**: the agent signs in to the gateway instead of holding the Dokploy key, and a policy decides tool by tool what each connection is allowed to call, with every call logged. We explain how that works in [What is an MCP gateway?](/blog/what-is-an-mcp-gateway)

## Quick checklist

- [ ] The agent uses its own Dokploy member user, not the owner
- [ ] That user can reach only the projects the agent needs
- [ ] Production is excluded until you trust the setup
- [ ] Only the tools you need are loaded
- [ ] Secret redaction is on
- [ ] Destructive tools require your approval
- [ ] Backups are scheduled and one restore has been tested

## FAQ

### Can I create a read-only Dokploy API key?

Not directly. Dokploy keys have no scope of their own; they inherit the creating user's permissions. To get a mostly read-only key, create a member user with no create or delete permissions, limit it to specific projects, and create the key as that user.

### Does the Dokploy MCP server expose my environment variables?

The official Dokploy MCP package redacts secret-bearing fields such as environment variables, Compose files, passwords and tokens by default. The underlying API key can still read them if called directly.

### Where does Claude store my Dokploy API key?

For local MCP servers, the key usually goes in an environment variable in the client's config file, stored in plain text on your machine. Anyone or anything that can read that file can use the key.

### Do Dokploy API keys expire?

Treat them as long-lived and rotate them yourself, especially after removing an agent or teammate. Revoke a key from Settings, then Profile, as soon as it's no longer needed.

### Is it safer to use Dokploy Cloud with an AI agent?

The same rules apply. Dokploy Cloud hosts the dashboard for you, but API keys work the same way and can do the same things on your servers.
