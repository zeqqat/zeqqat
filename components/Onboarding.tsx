import { completeSetupAction } from "../lib/actions/workspace";
import { AgentPicker } from "./AgentPicker";
import { AgentWatch } from "./AgentWatch";
import { ConnectDokployForm } from "./ConnectDokployForm";
import { agentName, DokployMark } from "./Marks";
import { Stepper } from "./Stepper";

export function OnboardConnectDokploy() {
  return (
    <div className="zq-ob">
      <Stepper
        steps={[
          { label: "Connect Dokploy", state: "now" },
          { label: "Connect an agent", state: "todo" },
        ]}
      />
      <p className="zq-kicker">Step 1 of 2</p>
      {/* The id is how the side menu's "connect first" modal finds this
          heading to shake it (components/AppShell.tsx). */}
      <h1 className="zq-h" id="zq-connect-dokploy">
        Connect your <DokployMark size={22} /> Dokploy
        <span className="dot">.</span>
      </h1>
      <div className="zq-ob-col">
        <ConnectDokployForm next="onboarding" defaultAlias="my-dokploy" />
      </div>
    </div>
  );
}

export function OnboardConnectAgent({ mcpUrl, alias }: { mcpUrl: string; alias: string | null; base?: string }) {
  return (
    <div className="zq-ob">
      <Stepper
        steps={[
          {
            label: alias ? `Dokploy: ${alias}` : "Dokploy connected",
            state: "done",
          },
          { label: "Connect an agent", state: "now" },
        ]}
      />
      <p className="zq-kicker">Step 2 of 2</p>
      <h1 className="zq-h">
        Connect your agent<span className="dot">.</span>
      </h1>
      <div className="zq-ob-col">
        <AgentPicker mcpUrl={mcpUrl} />
        <AgentWatch />
      </div>
    </div>
  );
}

// An invited member's first stop: connect their own agent. Everything else
// in the workspace opens once it is connected (components/AppShell.tsx).
export function MemberStart({ mcpUrl, organization }: { mcpUrl: string; organization: string; base?: string }) {
  return (
    <div className="zq-ob">
      <h1 className="zq-h">
        Welcome to {organization}
        <span className="dot">.</span>
      </h1>
      <p className="zq-sub">Connect your agent to get started.</p>
      <div className="zq-ob-col">
        <AgentPicker mcpUrl={mcpUrl} />
        <AgentWatch />
      </div>
    </div>
  );
}

export function SetupChoice({ siteHost, agentHost }: { siteHost: string; agentHost: string | null }) {
  return (
    <div>
      <span className="zq-status">
        <span className="zq-dot is-live" aria-hidden="true" />
        {agentHost ? `${agentName(agentHost)} is connected` : "Your agent is connected"}
      </span>
      <h1 className="zq-h" style={{ marginTop: 18 }}>
        You&rsquo;re set up. Where should Zeqqat run
        <span className="dot">?</span>
      </h1>
      <p className="zq-sub">
        Both work the same way for your agents. Pick whichever suits you, and switch later if you like.
      </p>
      <div className="zq-choice">
        <section className="zq-choice-card" aria-labelledby="choice-hosted">
          <span className="zq-where" style={{ alignSelf: "flex-start" }}>
            <b>{siteHost}</b>
          </span>
          <h2 className="zq-choice-h" id="choice-hosted">
            Keep using {siteHost}
          </h2>
          <ul className="zq-choice-list">
            <li>Nothing else to set up. Your agents already work.</li>
            <li>Your Dokploy key is stored encrypted here.</li>
            <li>Invite teammates and manage everything from this dashboard.</li>
          </ul>
          <form action={completeSetupAction}>
            <input type="hidden" name="choice" value="hosted" />
            <button type="submit" className="zq-action">
              Keep using {siteHost}
            </button>
          </form>
        </section>
        <section className="zq-choice-card" aria-labelledby="choice-self">
          <span className="zq-where is-self" style={{ alignSelf: "flex-start" }}>
            <span className="zq-where-tag">Open source</span>
            <b>your Dokploy</b>
          </span>
          <h2 className="zq-choice-h" id="choice-self">
            Install on your own Dokploy
          </h2>
          <ul className="zq-choice-list">
            <li>Zeqqat runs on your server, so your Dokploy key never leaves it.</li>
            <li>Free and open source.</li>
            <li>One click installs it on your Dokploy.</li>
            <li>You get your own MCP URL to add to your agents.</li>
          </ul>
          <form action={completeSetupAction}>
            <input type="hidden" name="choice" value="self-host" />
            <button type="submit" className="zq-action">
              Install on your own Dokploy
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
