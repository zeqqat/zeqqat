import { ThemeToggle } from "./ThemeToggle";

// Header for pages outside the dashboard (sign in, invites, the agent
// consent screen).
export function PublicHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="zq-top">
      <div className="zq-top-left">
        <a href="/" className="zq-brand" aria-label="Zeqqat home">
          <span className="zq-logo" aria-hidden="true">
            Z
          </span>
          <span className="zq-name">zeqqat</span>
        </a>
      </div>
      <div className="zq-top-right">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}
