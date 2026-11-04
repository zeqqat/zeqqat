import { CopyButton } from "./CopyButton";
import type { AgentKey } from "../lib/agents";

const cursorConfig = (mcpUrl: string) => `{
  "mcpServers": {
    "zeqqat": {
      "url": "${mcpUrl}"
    }
  }
}`;

const vscodeConfig = (mcpUrl: string) => `{
  "servers": {
    "zeqqat": {
      "type": "http",
      "url": "${mcpUrl}"
    }
  }
}`;

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
              Open <b>Settings → Connectors → Add custom connector</b> and paste the URL
            </li>
            <li>
              Review the URL and click <b>Add</b>
            </li>
            <li>Sign in when the browser opens</li>
          </ol>
          <p className="zq-note">
            On Team and Enterprise plans, an Owner adds Zeqqat once under{" "}
            <b>Organization settings → Connectors</b>. Members then connect to it individually.
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
              Select <b>zeqqat</b>, choose <b>Authenticate</b>, and sign in
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
              Add the block to <code>~/.cursor/mcp.json</code>, or use{" "}
              <b>Settings → MCP → Add new MCP server</b>
            </li>
            <li>Open MCP settings and authorize when prompted</li>
            <li>A green dot means the tools are live in Agent mode</li>
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
              Open <b>Settings → Apps &amp; Connectors → Advanced</b> and turn on{" "}
              <b>Developer Mode</b>
            </li>
            <li>
              Back in Apps &amp; Connectors, click <b>Create</b> and paste the URL
            </li>
            <li>
              Leave authentication on <b>OAuth</b> and sign in
            </li>
          </ol>
          <p className="zq-note">
            Custom connectors need a paid plan. Developer Mode is a one-time switch per account.
          </p>
        </div>
      );
    case "vscode": {
      const config = vscodeConfig(mcpUrl);
      return (
        <div>
          <div className="zq-cbox">
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">.vscode/mcp.json</span>
              <CopyButton text={config} />
            </div>
            <pre className="zq-cbox-block">
              <code>{config}</code>
            </pre>
          </div>
          <ol className="zq-steps">
            <li>
              Create <code>.vscode/mcp.json</code> and add the block
            </li>
            <li>Start the server from the editor and authorize when prompted</li>
            <li>The tools appear in Agent mode</li>
          </ol>
        </div>
      );
    }
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
