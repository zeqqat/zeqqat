---
title: "What Is an MCP Gateway, and Why Self-Hosters Need One"
seoTitle: "What Is an MCP Gateway? A Plain-English Guide (2026)"
description: "An MCP gateway sits between your AI agents and your MCP servers. What it does, how it differs from an MCP server, and when a self-hoster actually needs one."
date: "2026-10-31"
keywords: "what is an mcp gateway, mcp gateway, self hosted mcp gateway, mcp server"
---

An **MCP gateway** is a single endpoint that sits between your AI agents and the MCP servers they use. Instead of every agent connecting to every server directly, each agent connects once to the gateway, and the gateway decides which tools that agent can see, holds the credentials those tools need, and records what was called.

If you've connected one or two MCP servers to Claude or Cursor, you probably don't feel the need for one yet. This post explains what problem a gateway solves, so you can tell when you've reached it.

## First, a 30-second refresher on MCP

MCP (Model Context Protocol) is the open standard that lets an AI app call tools. It has two sides:

- An **MCP client** is the agent or app: Claude, ChatGPT, Cursor, Claude Code, a terminal agent.
- An **MCP server** exposes tools. A Dokploy MCP server might expose `application-deploy`, `domain-create` and hundreds more, each mapped to an API call.

The client asks the server which tools exist, the model picks one, and the client calls it. That's the whole loop.

## The problem: everything connects to everything

MCP works beautifully with one agent and one server. It gets messy as soon as you have more of either.

Say you self-host apps on Dokploy, keep DNS on Cloudflare, and send email through AWS SES. You use Claude on your laptop, Claude Code in the terminal, and Cursor in your editor. Without a gateway:

- **Every client needs every server configured.** Three clients times three servers is nine configs to set up and keep in sync.
- **API keys end up in config files.** Most MCP servers authenticate with an environment variable like `DOKPLOY_API_KEY`. That key sits in plain text in each client's config, on each machine.
- **Keys are all or nothing.** The key the agent holds can usually do anything its owner can do: deploy, delete, read secrets. The agent only needed to restart one app.
- **Nobody knows what happened.** When something changes on your server, there's no single place showing which agent called which tool, with what inputs.
- **Teammates multiply the problem.** Giving a colleague's agent access means sharing a key, and taking it back means rotating it everywhere.
- **Tool counts explode.** The official Dokploy MCP package exposes over 500 tools. Add a few more servers and you're well past what a model should be choosing from in one list.

## What an MCP gateway does

A gateway turns that mesh into a hub. Agents connect to one URL. The gateway connects to everything else. In the middle it can do things no single MCP server does:

1. **One endpoint per use.** Each agent or team gets a URL that exposes exactly the tools it needs. Add a new server once, at the gateway, and every connection that should see it does.
2. **Real sign-in instead of pasted keys.** The agent signs in with OAuth. The gateway stores the upstream API keys encrypted, and the agent never sees them.
3. **Per-tool permissions.** Allow `application-deploy` but deny `application-delete`. Allow reading logs but not environment variables. A policy decides what each connection can call, regardless of how powerful the underlying key is.
4. **An audit log.** Every call is recorded: who, which agent, which tool, which inputs, what came back.
5. **Search over large catalogs.** Instead of dumping 500 tools into the model's context, the gateway can expose a search tool so the agent finds the two or three it needs.
6. **Team access.** Invite a teammate, give them a role, remove them later. No keys change hands.

## MCP gateway vs MCP server vs MCP proxy

These terms get mixed up, so here's the distinction:

| | What it is | Example |
|---|---|---|
| MCP server | Exposes tools for one system | A Dokploy MCP server |
| MCP proxy | Forwards MCP traffic, often to change transport (stdio to HTTP) | A local bridge so a web client can reach a stdio server |
| MCP gateway | One front door for many servers, adding auth, policy, audit and routing | A single URL in front of Dokploy, Cloudflare and SES tools |
| MCP registry | A directory of servers you can install | The official MCP Registry |

A gateway usually includes proxying, but a proxy alone doesn't decide who can do what.

## Who is building MCP gateways

The category is new and growing fast. Searches for "mcp gateway" now run in the thousands per month, and products range from enterprise API gateways that added MCP support (Kong, for example) to developer tools like Docker's MCP gateway that run servers locally in containers. Most target companies with security teams. Fewer are aimed at individuals and small teams running their own servers.

## Why self-hosters in particular need one

If you run your own infrastructure, the stakes are a little different from a SaaS user connecting to Notion:

- **The tools can break production.** A Dokploy or Coolify API key can delete apps and databases. A wrong tool call isn't a bad answer in a chat, it's downtime.
- **There's no vendor safety net.** Nobody else is watching your server's audit trail. If you don't log agent actions, no one does.
- **You already self-host for control.** Handing an agent an unrestricted key gives some of that control back.
- **A gateway can itself be self-hosted.** You can run it on the same Dokploy server it protects, so keys never leave your infrastructure.

## Do you need an MCP gateway?

You probably don't yet if:

- You use one agent with one or two MCP servers.
- The servers are read-only or harmless if misused.
- You're the only person involved.

You probably do if any of these are true:

- An agent holds a key that can deploy, delete or read secrets on a server you care about.
- You use more than one MCP client and are tired of copying configs between them.
- Teammates (or their agents) need access, and you want to grant and revoke it without rotating keys.
- You want to know, after the fact, exactly what an agent did.

## FAQ

### What is the difference between an MCP gateway and an MCP server?

An MCP server exposes tools for one system, such as Dokploy. An MCP gateway sits in front of many MCP servers and adds sign-in, per-tool permissions, credential storage and an audit log, so agents connect to one endpoint instead of many.

### Is an MCP gateway the same as an API gateway?

They're related. An API gateway manages HTTP traffic to APIs. An MCP gateway speaks the MCP protocol to AI agents, and its policies are about which tools an agent can call. Some API gateways have added MCP support.

### Can I self-host an MCP gateway?

Yes. Several MCP gateways are open source and run in Docker, so you can deploy one on a VPS or on a platform like Dokploy or Coolify, next to the services it connects to.

### Does an MCP gateway slow down tool calls?

It adds one network hop, usually a few milliseconds. Compared with the time a model spends deciding what to call, it's negligible.

### Do MCP gateways work with Claude and ChatGPT?

Yes. A gateway exposes a standard remote MCP endpoint, so any client that supports remote MCP servers, including Claude, ChatGPT, Cursor and Claude Code, can connect to it.
