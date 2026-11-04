export type Step = { label: string; state: "done" | "now" | "todo" };

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="zq-stepper" aria-label="Setup progress">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={s.state === "done" ? "is-done" : s.state === "now" ? "is-now" : undefined}
          aria-current={s.state === "now" ? "step" : undefined}
        >
          <span className="n" aria-hidden="true">
            {s.state === "done" ? "✓" : i + 1}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}
