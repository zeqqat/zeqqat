import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { AgentPicker } from "../../../../components/AgentPicker";
import { ConnectDokployForm } from "../../../../components/ConnectDokployForm";
import { DokployMark } from "../../../../components/Marks";
import { Stepper } from "../../../../components/Stepper";
import { WorkspaceForm } from "../../../../components/WorkspaceForm";
import { db } from "../../../../db";
import { instance, integration, organization, workspace } from "../../../../db/schema";
import { primaryConnection } from "../../../../lib/connections";
import { requireUser } from "../../../../lib/guard";
import { wsBase } from "../../../../lib/paths";
import { finishSetup, joinedElsewhere, pendingInvitesFor, personalAccountOf, setupStep } from "../../../../lib/setup";

// Setup on your own account: connect a Dokploy, name a workspace, connect an
// agent. The step comes from what exists, so leaving and coming back picks
// up where you were. Done once an agent has connected.
export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { org } = await params;
  const own = await personalAccountOf(user.id);
  if (!own || own.slug !== org) notFound();
  const st = await setupStep(own.id);
  if (st.step === 4 || own.setupCompletedAt) {
    await finishSetup(own.id);
    const [w] = st.workspaceId ? await db.select({ slug: workspace.slug }).from(workspace).where(eq(workspace.id, st.workspaceId)) : [];
    redirect(w ? wsBase(own.slug, w.slug) : `/${own.slug}`);
  }
  const query = await searchParams;
  // An invite waiting for this email comes before Setup: Join, or Decline
  // and come back here.
  if (st.step === 1 && !(await joinedElsewhere(user.id, own.id))) {
    const [invite] = await pendingInvitesFor(user.id);
    if (invite) redirect(`/invites/${invite.id}`);
  }

  // "Connect another Dokploy instance" from step 2 comes back to step 1's
  // form; saving it returns to step 2 with the new instance ticked.
  const adding = st.step === 2 && query.add === "1";
  if (st.step === 1 || adding) {
    return (
      <div className="zq-ob">
        <Stepper steps={[{ label: "Connect Dokploy", state: "now" }, { label: "Name your workspace", state: "todo" }, { label: "Connect an agent", state: "todo" }]} />
        <p className="zq-kicker">Step 1 of 3</p>
        <h1 className="zq-h" id="zq-connect-dokploy">
          Connect your <DokployMark size={22} /> Dokploy
          <span className="dot">.</span>
        </h1>
        <div className="zq-ob-col">
          <ConnectDokployForm next="setup" defaultAlias={adding ? "" : "my-dokploy"} />
          {adding && (
            <p className="zq-note zq-ob-refresh">
              <a className="zq-textlink" href={`/${own.slug}/setup`}>
                Back to naming your workspace
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (st.step === 2) {
    const [insts, wss] = await Promise.all([
      db
        .select({ id: instance.id, alias: instance.alias, baseUrl: instance.baseUrl, appSlug: integration.slug, appName: integration.name, appLogo: integration.logoUrl })
        .from(instance)
        .innerJoin(integration, eq(integration.id, instance.integrationId))
        .where(eq(instance.organizationId, own.id))
        .orderBy(asc(instance.createdAt)),
      db.select({ slug: workspace.slug }).from(workspace).innerJoin(organization, eq(organization.id, workspace.organizationId)).where(and(eq(organization.id, own.id))),
    ]);
    const choices = insts.map(({ baseUrl, ...r }) => ({ ...r, host: baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "") }));
    const existing = wss.map((w) => w.slug);
    return (
      <div className="zq-ob">
        <Stepper steps={[{ label: `Dokploy: ${st.alias}`, state: "done" }, { label: "Name your workspace", state: "now" }, { label: "Connect an agent", state: "todo" }]} />
        <p className="zq-kicker">Step 2 of 3</p>
        <h1 className="zq-h">
          Name your workspace<span className="dot">.</span>
        </h1>
        <div className="zq-ob-col">
          <WorkspaceForm mode="setup" account={own.slug} instances={choices} existing={existing} checked={choices.map((c) => c.id)} />
        </div>
      </div>
    );
  }

  const [w] = await db.select({ id: workspace.id, slug: workspace.slug }).from(workspace).where(eq(workspace.id, st.workspaceId!));
  const conn = await primaryConnection({ organizationId: own.id, workspaceId: w.id, workspaceSlug: w.slug }, user.id);
  return (
    <div className="zq-ob">
      <Stepper steps={[{ label: `Dokploy: ${st.alias}`, state: "done" }, { label: `Workspace: ${w.slug}`, state: "done" }, { label: "Connect an agent", state: "now" }]} />
      <p className="zq-kicker">Step 3 of 3</p>
      <h1 className="zq-h">
        Connect your agent<span className="dot">.</span>
      </h1>
      <div className="zq-ob-col">
        {query.check === "1" && (
          <div className="zq-warn-box" role="alert">
            <span className="ic" aria-hidden="true">
              !
            </span>
            <span>No agent has connected to {w.slug} yet. Approve Zeqqat in your agent, then refresh.</span>
          </div>
        )}
        <AgentPicker mcpUrl={conn.url} />
        <p className="zq-note zq-ob-refresh">
          Already approved it?{" "}
          <a className="zq-textlink" href={`/${own.slug}/setup?check=1`}>
            Refresh this page
          </a>
        </p>
      </div>
    </div>
  );
}
