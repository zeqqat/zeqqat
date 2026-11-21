import type { ActivityCall } from "../../lib/activity";
import { InfoBubble } from "./InfoBubble";
import { JsonView } from "./JsonView";
import { Chain } from "./Parts";
import { Clock } from "./Time";
import { ToolName } from "./ToolName";
import { CallDrawer } from "./CallDrawer";

const SHIELD = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export { LookupLine } from "./LookupLine";

export const CALL_SUMMARY_TEXT =
  "What the agent sent to Zeqqat: the inputs it passed, the MCP URL they came through, and the instance they acted on.";

function why(call: ActivityCall): { tone: "blocked" | "error"; text: string } | null {
  if (call.state === "blocked") {
    const policy = call.policyName ? call.policyName.slice(call.policyName.lastIndexOf(".policy.") + 8) : null;
    return {
      tone: "blocked",
      text: policy ? `Not sent: ${call.op ?? call.toolName} is not on the ${policy} policy.` : (call.errorMessage ?? "Not sent: not allowed."),
    };
  }
  if (call.state === "error") {
    return {
      tone: "error",
      text: call.httpStatus ? `${call.instanceAlias ?? "The instance"} answered ${call.httpStatus}.` : (call.errorMessage ?? "Failed."),
    };
  }
  return null;
}

// One call to an app: the chain and time on top, the full tool name, the
// endpoint's plain description, then what it was called with. With `href`
// (a request page's list) the JSON starts closed: a click on the card opens
// it like a drawer, with a link to the call's own page inside. Without it
// (the call page, the landing demo) everything shows.
export function CallCard({ call, href }: { call: ActivityCall; href?: string }) {
  const w = why(call);
  const summary = { instance: call.instanceAlias, connection: call.connectionName, inputs: call.inputs ?? {} };
  const chain = (
    <Chain
      state={call.state}
      integrationSlug={call.integrationSlug ?? ""}
      integrationName={call.integrationRef ?? call.toolName}
      instance={call.instanceAlias}
    />
  );
  const clock = <Clock iso={call.at} ms={call.state === "running" || call.state === "blocked" ? null : call.durationMs} />;
  const notes = (
    <>
      {call.summary && <div className="zq-cc-desc">{call.summary}</div>}
      {w && <div className={`zq-cc-why is-${w.tone}`}>{w.text}</div>}
    </>
  );
  const json = (
    <div className="zq-json-box has-info">
      <InfoBubble title="Call summary">{CALL_SUMMARY_TEXT}</InfoBubble>
      <JsonView value={summary} />
    </div>
  );
  const hidden =
    call.redactions > 0 ? (
      <span className="zq-cc-red">
        {SHIELD}
        {call.redactions === 1 ? "1 secret hidden" : `${call.redactions} secrets hidden`}
      </span>
    ) : null;

  if (href) {
    return (
      <CallDrawer toolName={call.toolName} href={href} chain={chain} clock={clock} notes={<>{notes}{hidden}</>}>
        {json}
      </CallDrawer>
    );
  }
  return (
    <div className="zq-cc">
      {chain}
      {clock}
      <div className="zq-cc-txt">
        <ToolName name={call.toolName} />
        {notes}
        {json}
        {hidden}
      </div>
    </div>
  );
}
