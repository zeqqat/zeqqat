import { CopyButton } from "./CopyButton";
import type { AgentKey } from "../lib/agents";

const cursorConfig = (mcpUrl: string) => `{
  "mcpServers": {
    "zeqqat": {
      "url": "${mcpUrl}"
    }
  }
}`;

// Steps checked against each vendor's own docs on 2026-11-11. These menus
// move often, so when one changes, check the source again and update the date:
//   Claude      https://claude.com/docs/connectors/custom/remote-mcp
//   Claude Code https://code.claude.com/docs/en/mcp
//   Cursor      https://cursor.com/docs/context/mcp
//   ChatGPT     https://help.openai.com/en/articles/12584461
//   VS Code     https://code.visualstudio.com/docs/agents/reference/mcp-configuration
//
// The "Add to Claude" desktop deep link from the prototype is dropped here:
// its format is unverified third-party knowledge (spec section 6 says test
// it opens the dialog before shipping, or drop it rather than ship a dead
// button) and there's no desktop Claude app available to verify it against.
export function AgentPanel({ agent, mcpUrl }: { agent: AgentKey; mcpUrl: string }) {
  switch (agent) {
    case "claude":
      return (
        <div>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">MCP server URL</span>
            </div>
            <div className="zq-cbox-row">
              <code>{mcpUrl}</code>
              <CopyButton text={mcpUrl} />
            </div>
          </div>
          <ol className="zq-steps">
            <li>
              In Claude, open{" "}
              <a className="zq-textlink" href="https://claude.ai/customize/connectors/yours" target="_blank" rel="noreferrer">
                <b>Customize → Connectors</b>
              </a>{" "}
              and click <b>Add custom connector</b>
            </li>
            <li>
              Paste the URL and click <b>Add</b>
            </li>
            <li>
              Click <b>Connect</b> and sign in
            </li>
          </ol>
          <p className="zq-note">
            On Team and Enterprise plans, an Owner adds it once under <b>Organization settings → Connectors</b>, then
            each member clicks <b>Connect</b> under <b>Customize → Connectors</b>.
          </p>
        </div>
      );
    case "claudecode": {
      const cmd = `claude mcp add --transport http zeqqat ${mcpUrl}`;
      return (
        <div>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">Terminal</span>
            </div>
            <div className="zq-cbox-row">
              <code>{cmd}</code>
              <CopyButton text={cmd} />
            </div>
          </div>
          <ol className="zq-steps">
            <li>Run the command in your terminal</li>
            <li>
              Start a session and run <code>/mcp</code>
            </li>
            <li>
              Select <b>zeqqat</b> and sign in when the browser opens
            </li>
          </ol>
          <p className="zq-note">
            No API key to manage. Works the same in the terminal, VS Code, and the desktop Code
            tab.
          </p>
        </div>
      );
    }
    case "cursor": {
      const config = cursorConfig(mcpUrl);
      return (
        <div>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">~/.cursor/mcp.json</span>
              <CopyButton text={config} />
            </div>
            <pre className="zq-cbox-block">
              <code>{config}</code>
            </pre>
          </div>
          <ol className="zq-steps">
            <li>
              Add the block to <code>~/.cursor/mcp.json</code> and save
            </li>
            <li>
              Open <b>Customize</b> in Cursor&rsquo;s sidebar, find <b>zeqqat</b> and sign in when asked
            </li>
            <li>The tools then show up in Agent mode</li>
          </ol>
          <p className="zq-note">
            Use <code>.cursor/mcp.json</code> in a project instead to share it with your team.
          </p>
        </div>
      );
    }
    case "chatgpt":
      return (
        <div>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">MCP server URL</span>
            </div>
            <div className="zq-cbox-row">
              <code>{mcpUrl}</code>
              <CopyButton text={mcpUrl} />
            </div>
          </div>
          <ol className="zq-steps">
            <li>
              Open <b>Settings → Apps → Advanced settings</b> and turn on <b>Developer mode</b>
            </li>
            <li>
              Back in <b>Apps</b>, click <b>Create app</b> and paste the URL
            </li>
            <li>
              Set authentication to <b>OAuth</b>, click <b>Create</b> and sign in
            </li>
          </ol>
          <p className="zq-note">
            Needs a paid plan. On Business and Enterprise, an admin may have to allow developer mode first.
          </p>
        </div>
      );
    case "vscode":
      return (
        <div>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">MCP server URL</span>
            </div>
            <div className="zq-cbox-row">
              <code>{mcpUrl}</code>
              <CopyButton text={mcpUrl} />
            </div>
          </div>
          <ol className="zq-steps">
            <li>
              Open the Command Palette and run <b>MCP: Add Server</b>
            </li>
            <li>
              Choose <b>HTTP</b>, paste the URL and name it <code>zeqqat</code>
            </li>
            <li>Sign in when asked, then use the tools in Copilot&rsquo;s agent mode</li>
          </ol>
        </div>
      );
    case "other":
      return (
        <div>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">MCP server URL</span>
            </div>
            <div className="zq-cbox-row">
              <code>{mcpUrl}</code>
              <CopyButton text={mcpUrl} />
            </div>
          </div>
          <ol className="zq-steps">
            <li>Point any MCP-compatible client at the URL over streamable HTTP</li>
            <li>Authorize through OAuth when prompted</li>
            <li>Every tool you&rsquo;ve enabled shows up in that client</li>
          </ol>
          <p className="zq-note">Same endpoint everywhere. Only the way you enter it changes.</p>
        </div>
      );
  }
}
