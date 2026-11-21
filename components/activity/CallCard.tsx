import type { ActivityCall } from "../../lib/activity";
import { InfoBubble } from "./InfoBubble";
import { JsonView } from "./JsonView";
import { Chain } from "./Parts";
import { Clock } from "./Time";
import { ToolName } from "./ToolName";

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

// One call to an app: the chain and time on top, the full tool name and the
// endpoint's plain description. On a request page (`href`) the card is a
// link to the call's own page, which has the rest in tabs. `json` adds what
// the call was made with under it (the landing demo). `position` ("Call 1 of
// 4") sits beside the chain on the call's own page.
export function CallCard({
  call,
  href,
  json = false,
  position,
}: {
  call: ActivityCall;
  href?: string;
  json?: boolean;
  position?: string;
}) {
  const w = why(call);
  const summary = { instance: call.instanceAlias, connection: call.connectionName, inputs: call.inputs ?? {} };
  return (
    <div className={`zq-cc${href ? " is-link" : ""}`}>
      {href && <a className="zq-rc-link" href={href} aria-label={`Open call: ${call.toolName}`} />}
      <span className="zq-cc-start">
        <Chain
          state={call.state}
          integrationSlug={call.integrationSlug ?? ""}
          integrationName={call.integrationRef ?? call.toolName}
          instance={call.instanceAlias}
        />
        {position && <span className="zq-cc-pos">{position}</span>}
      </span>
      <Clock iso={call.at} ms={call.state === "running" || call.state === "blocked" ? null : call.durationMs} />
      <div className="zq-cc-txt">
        <ToolName name={call.toolName} href={href} />
        {call.summary && <div className="zq-cc-desc">{call.summary}</div>}
        {w && <div className={`zq-cc-why is-${w.tone}`}>{w.text}</div>}
        {json && (
          <div className="zq-json-box has-info">
            <InfoBubble title="Call summary">{CALL_SUMMARY_TEXT}</InfoBubble>
            <JsonView value={summary} />
          </div>
        )}
        {call.redactions > 0 && (
          <span className="zq-cc-red">
            {SHIELD}
            {call.redactions === 1 ? "1 secret hidden" : `${call.redactions} secrets hidden`}
          </span>
        )}
      </div>
    </div>
  );
}
