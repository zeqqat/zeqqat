import type { ReactNode } from "react";

// Real JSON, pretty-printed, with keys, punctuation and values in their
// own colours and every "[redacted by zeqqat]" highlighted where it sits.

const MARK = "[redacted by zeqqat]";

function str(value: string, key: string): ReactNode {
  const quoted = JSON.stringify(value);
  if (!quoted.includes(MARK)) return <span className="s" key={key}>{quoted}</span>;
  const parts = quoted.split(MARK);
  return (
    <span className="s" key={key}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="rd">{MARK}</span>}
        </span>
      ))}
    </span>
  );
}

function render(value: unknown, indent: string, key: string): ReactNode {
  if (value === null || value === undefined) return <span className="s" key={key}>null</span>;
  if (typeof value === "string") return str(value, key);
  if (typeof value !== "object") return <span className="s" key={key}>{JSON.stringify(value)}</span>;

  const inner = indent + "  ";
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="p" key={key}>[]</span>;
    return (
      <span key={key}>
        <span className="p">[</span>
        {"\n"}
        {value.map((v, i) => (
          <span key={i}>
            {inner}
            {render(v, inner, `${key}.${i}`)}
            {i < value.length - 1 && <span className="p">,</span>}
            {"\n"}
          </span>
        ))}
        {indent}
        <span className="p">]</span>
      </span>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span className="p" key={key}>{"{}"}</span>;
  return (
    <span key={key}>
      <span className="p">{"{"}</span>
      {"\n"}
      {entries.map(([k, v], i) => (
        <span key={k}>
          {inner}
          <span className="k">{JSON.stringify(k)}</span>
          <span className="p">: </span>
          {render(v, inner, `${key}.${k}`)}
          {i < entries.length - 1 && <span className="p">,</span>}
          {"\n"}
        </span>
      ))}
      {indent}
      <span className="p">{"}"}</span>
    </span>
  );
}

export function JsonView({ value }: { value: unknown }) {
  return <pre className="zq-json">{render(value, "", "root")}</pre>;
}
