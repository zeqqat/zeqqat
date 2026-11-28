---
title: "Self-Hosted Claude: Run Your Own Claude Chat and Agents on a VPS"
seoTitle: "Self-Hosted Claude on a VPS: LibreChat and Claude Agents with Dokploy"
description: "Self-hosted Claude, explained: run a private Claude chat with LibreChat and your own Claude agents on a VPS with Dokploy, plus the one template setting to fix first."
date: "2026-11-28"
keywords: "self hosted claude, self host claude, self hosted claude agents, claude agent sdk docker, claude agent sdk vps, librechat claude, librechat dokploy, self hosted claude chat, claude api self hosted ui"
---

If you're searching for self-hosted Claude, here's the honest answer first: you can't download Claude and run the model on your own server. Anthropic doesn't release the weights. What you can self-host is everything around it: a private chat app that talks to Claude through your API key, and your own Claude agents running on a VPS you control. With Dokploy, both take about fifteen minutes and no Docker commands.

I'll show both, step by step, for someone who has never self-hosted anything. Then I'll show the easier way, where I asked Claude to find and check the setup for me.

## What "self-hosted Claude" really means

There are two things people usually want:

1. **A Claude chat you own.** Your own ChatGPT-style web app, on your domain, with your conversations stored in your database. You pay Anthropic per use through an API key instead of a monthly seat per person. LibreChat is the best fit, and Dokploy has a template for it.
2. **A Claude agent that runs on its own.** Something that takes a task, uses tools (search the web, read files, run commands) and returns a result, without you sitting at a laptop. That's Anthropic's Claude Agent SDK, the same agent loop and tools that power Claude Code, packaged for Python and TypeScript. There's no template for your own agent, so you deploy it as an app from Git.

In both cases the model still runs at Anthropic. Your server holds the app, the data and the key.

## What you need

- **A VPS.** Dokploy needs at least 2 GB of RAM and 30 GB of disk. The LibreChat template runs five containers (LibreChat, MongoDB, Meilisearch, Postgres with pgvector and a RAG API), so I'd pick 4 GB. For agents, Anthropic's hosting docs suggest 1 GiB of RAM, 5 GiB of disk and 1 CPU per agent as a starting point. Hetzner, DigitalOcean, Hostinger and others all work. Choose Ubuntu or Debian.
- **A domain** you can add DNS records to, so you get HTTPS.
- **An Anthropic API key** from the [Claude Console](https://platform.claude.com/). A Claude Pro or Max login is not the way here: Anthropic's Agent SDK docs say third-party products, including agents built on the SDK, must use API keys unless Anthropic approved otherwise.

## Step 1: Install Dokploy

SSH into your server and run Dokploy's install script:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Ports 80, 443 and 3000 must be free. When it finishes, open `http://your-server-ip:3000` and create your admin account.

## Step 2: Deploy LibreChat from the template

1. Create a project (call it "claude").
2. Inside it, click **Create Service**, choose **Template**, search for **LibreChat** and create it.

Dokploy creates a Docker Compose service and fills in the environment. Most of it is good: random secrets for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MEILI_MASTER_KEY` and the Postgres password, and `ALLOW_REGISTRATION=false` so strangers can't sign up. Don't deploy yet.

## Step 3: Fix the environment before the first deploy

Open the service's **Environment** tab and change four things.

1. **Add your key.** Set `ANTHROPIC_API_KEY=` to your Anthropic key. This turns on the Claude models in LibreChat. Leave the other provider keys empty if you only want Claude.
2. **Replace `CREDS_KEY` and `CREDS_IV`.** This is the one I'd fix on every install. Unlike the other secrets, these two are not generated. The template hardcodes the same values for everyone, and they're the example values from older versions of LibreChat's sample config, so anyone can look them up. LibreChat uses them to encrypt the credentials it stores, and its current sample config says to set unique values before using it in production. Generate your own on any machine:

```bash
openssl rand -hex 32   # CREDS_KEY (64 characters)
openssl rand -hex 16   # CREDS_IV (32 characters)
```

   Do this before you store anything. Changing them later makes credentials saved with the old pair unreadable.

3. **Set `DOMAIN_CLIENT` and `DOMAIN_SERVER`** to `https://chat.yourdomain.com` (your real domain, next step).
4. **Turn registration on for one minute.** Set `ALLOW_REGISTRATION=true`. LibreChat gives the admin role to the first account registered, so you'll create yours and switch it back off.

If you want LibreChat's file search (asking questions about uploaded PDFs), the template's RAG service uses OpenAI embeddings by default, so it also needs `RAG_OPENAI_API_KEY`. Plain chat with Claude works without it.

## Step 4: Add your domain with HTTPS

1. At your DNS provider, add an **A record** for `chat.yourdomain.com` pointing to your server's IP. On Cloudflare, set it to DNS only (grey cloud) so Let's Encrypt can reach your server.
2. In Dokploy, open the service's **Domains** tab and edit the domain: host `chat.yourdomain.com`, service `librechat`, port `3080`, turn on **HTTPS** and choose **Let's Encrypt**.

The template also gives you a generated `sslip.io` domain. It's HTTP only, so skip it for anything with a password.

## Step 5: Deploy, register, lock it

1. Click **Deploy**. The first pull takes a few minutes.
2. Open `https://chat.yourdomain.com`, register your account, and pick a Claude model in the model menu. Send a message to check the key works.
3. Back in **Environment**, set `ALLOW_REGISTRATION=false` and deploy again.

To add people later without opening registration, LibreChat has a script: open the `librechat` container's terminal in Dokploy and run `npm run create-user`. It asks for the email and password.

One more thing to know: the template uses the `librechat-dev:latest` image, which follows LibreChat's development branch. If you'd rather not get every change, pin a release tag in the Compose file.

## Step 6: Run your own Claude agent

Now the agent. This is a tiny Python service that takes a prompt over HTTP, lets Claude use web search to answer it, and returns the result. Two files in a Git repo.

`main.py`:

```python
import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

app = FastAPI()
TOKEN = os.environ["AGENT_TOKEN"]


class Ask(BaseModel):
    prompt: str


@app.post("/ask")
async def ask(body: Ask, authorization: str = Header(default="")):
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401)
    options = ClaudeAgentOptions(
        allowed_tools=["WebSearch", "WebFetch"],
        max_turns=10,
        max_budget_usd=0.50,
    )
    async for message in query(prompt=body.prompt, options=options):
        if isinstance(message, ResultMessage):
            return {"answer": message.result, "cost_usd": message.total_cost_usd}
    raise HTTPException(status_code=500)
```

`Dockerfile`:

```dockerfile
FROM python:3.12-slim
RUN useradd --create-home agent
WORKDIR /app
RUN pip install --no-cache-dir claude-agent-sdk fastapi uvicorn
COPY main.py .
USER agent
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The SDK ships its own copy of the Claude Code binary and runs it as a subprocess, so you don't install Node or anything else. It reads `ANTHROPIC_API_KEY` from the environment.

Three lines in there are about safety, not features. `allowed_tools` limits what the agent can do (no shell, no file edits). `max_turns` and `max_budget_usd` stop a runaway task from spending your credit. And the bearer token check means a stranger who finds the URL can't use your key.

To deploy it in Dokploy:

1. In your project, **Create Service**, choose **Application**.
2. Under **Provider**, connect your Git repo and branch. Set **Build Type** to **Dockerfile**.
3. In **Environment**, add `ANTHROPIC_API_KEY=...` and `AGENT_TOKEN=` set to a long random string (`openssl rand -hex 32`).
4. In **Domains**, add `agent.yourdomain.com`, port `8000`, HTTPS with Let's Encrypt.
5. Click **Deploy**.

Then call it:

```bash
curl -X POST https://agent.yourdomain.com/ask \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What changed in the latest Dokploy release?"}'
```

Turn on **Autodeploy** and every push to the branch redeploys the agent.

## Lock down the server

Same advice as any VPS, from Dokploy's security recommendations:

- **Use your VPS provider's firewall** and allow only SSH, 80 and 443. Docker writes its own iptables rules and walks past UFW.
- **Use SSH keys** and turn off password login.
- **Give Dokploy its own HTTPS domain**, then close port 3000.
- **Set a spending limit** in the Claude Console. Your API key is now on a server that's always on.

## The easier way: just ask Claude

All of that is clicking through Dokploy. You can skip learning Dokploy by connecting it to Claude (or any AI that speaks MCP) through Zeqqat. You add your Dokploy URL and an API key to Zeqqat once, then paste Zeqqat's MCP URL into Claude as a connector. After that you say what you want.

Here's what I asked:

> I want to self-host a Claude chat on my Dokploy. Find a template that works with an Anthropic key and show me exactly what it would deploy. Don't create anything.

Here's what happened, call by call:

1. Claude searched Zeqqat for "template" and found Dokploy's template tools: list, preview and deploy.
2. It listed the templates. My Dokploy has 602. It picked out the chat apps (LibreChat, Lobe Chat, Open WebUI) and a few agent platforms built around Claude Code (Multica, Ponos), and suggested LibreChat because its template already has an `ANTHROPIC_API_KEY` slot.
3. It took LibreChat's template from Dokploy's public templates repo and ran Dokploy's preview, which is read only. Dokploy worked out what it would create without saving anything:

```
domains: librechat, port 3080, <generated>.sslip.io
envs:
  DOMAIN_CLIENT=https://<generated>.sslip.io
  MEILI_MASTER_KEY={{zq_secret_q5arl2h4ussk6uit}}
  JWT_SECRET={{zq_secret_ly08wpdmi3anip04}}
  JWT_REFRESH_SECRET={{zq_secret_2soxll6uhjzdodqz}}
  CREDS_KEY={{zq_secret_er7y17h2mad0ljj8}}
  CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb
  ANTHROPIC_API_KEY=
  POSTGRES_PASSWORD={{zq_secret_qntk1mprim63tnoj}}
  ALLOW_REGISTRATION=false
  ...
```

The generated secrets never reached Claude. Zeqqat swapped them for `{{zq_secret_...}}` handles before the answer came back. Because Claude had the template source open next to the preview, it caught the problem in Step 3: every other secret in the source is `${password:...}`, which Dokploy generates per install, but `CREDS_KEY` and `CREDS_IV` are fixed strings. `CREDS_IV` came back in plain text, the same value as in the source. It also pointed out that `DOMAIN_CLIENT` says `https://` while the generated domain only serves HTTP.

I stopped there. Deploying is one more call to Dokploy's deploy-template tool, and my Zeqqat connection allows it because it creates something new. Delete is switched off on that connection, so Claude can set things up but can't remove anything. Every call carried the same one-line reason, so Zeqqat's activity log shows the whole thing as one request.

## What I took from it

Self-hosted Claude isn't the model on your server. It's your chat, your agents, your data and your key on a box you control, with Anthropic doing the thinking. Dokploy makes the hosting part a template and an app from Git. The one thing I'd never skip is replacing the two LibreChat secrets the template doesn't generate.

Zeqqat is a free and open source MCP gateway for Dokploy. Self-host it or use [zeqqat.com](https://zeqqat.com). The code is on [GitHub](https://github.com/zeqqat/zeqqat).

## FAQ

### Can I self-host Claude without an API key?

No. Claude's model runs only at Anthropic (or through cloud providers like Amazon Bedrock and Google Vertex), so a self-hosted Claude app always needs a key from one of them. Anthropic's Agent SDK docs also say products built on the SDK should use API keys, not a Claude Pro or Max login, unless Anthropic approved otherwise.

### Is self-hosting Claude cheaper than a Claude subscription?

It depends on how much you use it. With an API key you pay per token, so a light user or a small team that chats occasionally can pay less than a seat each, while heavy daily use can cost more. The VPS itself is a few dollars a month. Set a spending limit in the Claude Console and a `max_budget_usd` on agents so a bad day can't surprise you.

### What is the best self-hosted UI for Claude?

LibreChat is the most complete: multiple users, conversation search, file uploads and agents, and Dokploy has a one-click template with an `ANTHROPIC_API_KEY` slot. Lobe Chat and Open WebUI also have Dokploy templates, though their templates don't come with an Anthropic key slot, so you set up the Claude connection yourself. Whichever you pick, put it on HTTPS and keep registration closed.
