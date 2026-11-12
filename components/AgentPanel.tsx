import { CopyButton } from "./CopyButton";
import { CHATGPT_PLUGINS_URL, claudeInstallLink, type AgentKey } from "../lib/agents";

const cursorConfig = (mcpUrl: string) => `{
  "mcpServers": {
    "zeqqat": {
      "url": "${mcpUrl}"
    }
  }
}`;

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
//   VS Code     https://code.visualstudio.com/docs/agent-customization/mcp-servers
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
    case "vscode":
      return (
        <div>
          <UrlBox label="MCP server URL" text={mcpUrl} />
          <ol className="zq-steps">
            <li>
              Run <b>MCP: Add Server</b> from the Command Palette
            </li>
            <li>
              Choose <b>HTTP</b>, paste the URL, name it <code>zeqqat</code> and sign in when asked
            </li>
          </ol>
        </div>
      );
    case "other":
      return (
        <div>
          <UrlBox label="MCP server URL" text={mcpUrl} />
          <p className="zq-note">Add it as a streamable HTTP server and sign in when asked.</p>
        </div>
      );
  }
}
