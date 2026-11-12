import { completeSetupAction } from "../lib/actions/workspace";
import { AgentPicker } from "./AgentPicker";
import { ConnectDokployForm } from "./ConnectDokployForm";
import { DokployMark } from "./Marks";
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
        <ConnectDokployForm next="onboarding" defaultAlias="production" />
      </div>
    </div>
  );
}

export function OnboardConnectAgent({ mcpUrl, alias }: { mcpUrl: string; alias: string | null }) {
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
        <p className="zq-note zq-ob-refresh">
          Already approved it?{" "}
          <a className="zq-textlink" href="/app">
            Refresh this page
          </a>
        </p>
      </div>
    </div>
  );
}

export function MemberStart({
  mcpUrl,
  name,
  workspace,
  instances,
}: {
  mcpUrl: string;
  name: string;
  workspace: string;
  instances: { alias: string; summary: string }[];
}) {
  return (
    <div>
      <Stepper
        steps={[
          { label: `Joined ${workspace}`, state: "done" },
          {
            label: "Dokploy connected by your team",
            state: instances.length ? "done" : "todo",
          },
          { label: "Connect your agent", state: "now" },
        ]}
      />
      <h1 className="zq-h">
        Welcome to {workspace}, {name}
        <span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        Your team connects Dokploy, so there&rsquo;s no key for you to add. Connect your agent and it can use the
        instances below, within the permissions your owners set.
      </p>
      <div className="zq-split">
        <section className="a">
          <AgentPicker mcpUrl={mcpUrl} />
          <p className="zq-note">
            On the approval screen, pick the <b>{workspace}</b> workspace.
          </p>
        </section>
        <aside className="b">
          <p className="zq-kicker" style={{ marginBottom: 10 }}>
            {workspace}&rsquo;s Dokploy
          </p>
          {instances.length === 0 ? (
            <p className="zq-empty">No Dokploy connected yet. An owner of {workspace} adds it.</p>
          ) : (
            <div className="zq-list">
              {instances.map((i) => (
                <div className="zq-item" key={i.alias}>
                  <span className="zq-item-ic">
                    <DokployMark />
                  </span>
                  <div className="zq-item-main">
                    <div className="zq-item-t">{i.alias}</div>
                    <div className="zq-item-s">{i.summary}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="zq-note">These are the team defaults for new agents. An owner can give yours more or less.</p>
        </aside>
      </div>
    </div>
  );
}

export function SetupChoice({ siteHost, agentHost }: { siteHost: string; agentHost: string | null }) {
  return (
    <div>
      <span className="zq-status">
        <span className="zq-dot is-live" aria-hidden="true" />
        {agentHost ? `${agentHost} is connected` : "Your agent is connected"}
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
            <span className="zq-where-tag">Beta</span>
            <b>{siteHost}</b>
          </span>
          <h2 className="zq-choice-h" id="choice-hosted">
            Keep using {siteHost}
          </h2>
          <ul className="zq-choice-list">
            <li>Nothing else to set up. Your agents already work.</li>
            <li>Free while in Beta.</li>
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
            <li>Your agent does the install for you.</li>
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
