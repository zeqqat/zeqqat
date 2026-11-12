import { CopyButton } from "./CopyButton";
import { CHATGPT_PLUGINS_URL, GROK_CONNECTORS_URL, claudeInstallLink, type AgentKey } from "../lib/agents";

const cursorConfig = (mcpUrl: string) => `{
  "mcpServers": {
    "zeqqat": {
      "url": "${mcpUrl}"
    }
  }
}`;

// A copyable block of several lines, e.g. a chat message to send an agent.
function TextBox({ label, text }: { label: string; text: string }) {
  return (
    <div className="zq-cbox">
      <div className="zq-cbox-top">
        <span className="zq-cbox-label">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="zq-cbox-block is-wrap">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function UrlBox({ label, text }: { label: string; text: string }) {
  return (
    <div className="zq-cbox">
      <div className="zq-cbox-top">
        <span className="zq-cbox-label">{label}</span>
      </div>
      <div className="zq-cbox-row">
        <code>{text}</code>
        <CopyButton text={text} />
      </div>
    </div>
  );
}

// Steps checked against each vendor's own docs on 2026-11-12. These menus
// move often, so when one changes, check the source again and update the date:
//   Claude      https://claude.com/docs/connectors/custom/add-unlisted
//   Claude Code https://code.claude.com/docs/en/mcp
//   ChatGPT     https://help.openai.com/en/articles/12584461 (renamed Apps to Plugins, mid 2026)
//   Cursor      https://cursor.com/docs/mcp/install-links
//   Grok        https://docs.x.ai/grok/connectors
//   Grok Bot    https://composio.dev/content/how-to-add-mcp-servers-to-grok-bot (no xAI doc yet)
//   Muse        https://anythingmcp.com/guides/clients/muse (no Meta doc found)
//
// Claude and Cursor open from their buttons (AgentPicker); their panels say
// what to click once the app is open.
export function AgentPanel({ agent, mcpUrl }: { agent: AgentKey; mcpUrl: string }) {
  switch (agent) {
    case "claude":
      return (
        <div>
          <ol className="zq-steps">
            <li>
              Claude opens with Zeqqat filled in. Click <b>Add</b>
            </li>
            <li>
              Click <b>Connect</b> and sign in
            </li>
          </ol>
          <p className="zq-note">
            On Team and Enterprise plans, an Owner adds it once{" "}
            <a className="zq-textlink" href={claudeInstallLink(mcpUrl, true)} target="_blank" rel="noreferrer">
              with this link
            </a>
            , then each member clicks <b>Connect</b> under <b>Customize → Connectors</b>.
          </p>
        </div>
      );
    case "claudecode": {
      const cmd = `claude mcp add --transport http zeqqat ${mcpUrl}`;
      return (
        <div>
          <UrlBox label="Terminal" text={cmd} />
          <ol className="zq-steps">
            <li>
              Run it, then start Claude Code and run <code>/mcp</code>
            </li>
            <li>
              Select <b>zeqqat</b> and sign in when the browser opens
            </li>
          </ol>
        </div>
      );
    }
    case "chatgpt":
      return (
        <div>
          <UrlBox label="MCP server URL" text={mcpUrl} />
          <ol className="zq-steps">
            <li>
              In ChatGPT, open <b>Settings → Security and login</b> and turn on <b>Developer mode</b>
            </li>
            <li>
              Open{" "}
              <a className="zq-textlink" href={CHATGPT_PLUGINS_URL} target="_blank" rel="noreferrer">
                <b>Plugins</b>
              </a>
              , click <b>+</b>, then <b>Create MCP app</b>
            </li>
            <li>
              Paste the URL, keep <b>OAuth</b>, click <b>Create</b> and sign in
            </li>
          </ol>
          <p className="zq-note">
            On Business and Enterprise, an admin turns on developer mode under{" "}
            <b>Settings → Apps → Advanced settings</b>.
          </p>
        </div>
      );
    case "cursor": {
      const config = cursorConfig(mcpUrl);
      return (
        <div>
          <ol className="zq-steps">
            <li>
              Cursor asks to install <b>zeqqat</b>. Click <b>Install</b>
            </li>
            <li>Sign in when Cursor asks</li>
          </ol>
          <p className="zq-note">
            Didn&rsquo;t open? Add this to <code>~/.cursor/mcp.json</code> instead.
          </p>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">~/.cursor/mcp.json</span>
              <CopyButton text={config} />
            </div>
            <pre className="zq-cbox-block">
              <code>{config}</code>
            </pre>
          </div>
        </div>
      );
    }
    case "grok":
      return (
        <div>
          <UrlBox label="MCP server URL" text={mcpUrl} />
          <ol className="zq-steps">
            <li>
              Open{" "}
              <a className="zq-textlink" href={GROK_CONNECTORS_URL} target="_blank" rel="noreferrer">
                <b>grok.com/connectors</b>
              </a>{" "}
              and click <b>New Connector</b>, then <b>Custom</b>
            </li>
            <li>Paste the URL and sign in</li>
          </ol>
          <p className="zq-note">
            Using Grok Bot? Send it this message, click <b>Add it</b>, then <b>Authorize</b>.
          </p>
          <TextBox label="Message" text={`Add a custom MCP server called zeqqat at ${mcpUrl}`} />
        </div>
      );
    case "muse":
      return (
        <div>
          <TextBox
            label="Message"
            text={`Create a Custom Connector for a new remote MCP server, then connect to it:\nName: Zeqqat\nTransport: remote streamable HTTP\nURL: ${mcpUrl}\nAuth: OAuth`}
          />
          <ol className="zq-steps">
            <li>Send this to Muse, on the web, in the app or in WhatsApp</li>
            <li>Sign in when Muse opens the sign-in page</li>
          </ol>
          <p className="zq-note">
            Or add it under <b>Settings → Connectors → Add custom connector</b>. Muse is available in the US and Canada.
          </p>
        </div>
      );
    case "other":
      return (
        <div>
          <UrlBox label="MCP server URL" text={mcpUrl} />
          <p className="zq-note">
            Add it as a streamable HTTP server and sign in when asked. In VS Code, run <b>MCP: Add Server</b>, choose{" "}
            <b>HTTP</b> and paste it.
          </p>
        </div>
      );
  }
}
