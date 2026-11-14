import { SOCIAL_LINKS } from "../lib/social-links";
import { ThemeToggle } from "./ThemeToggle";

const SOCIAL = [
  { name: "Discord", href: SOCIAL_LINKS.discord, logo: "/logos/discord.svg" },
  { name: "X", href: SOCIAL_LINKS.x, logo: "/logos/x.svg" },
  { name: "GitHub", href: SOCIAL_LINKS.github, logo: "/logos/github.svg" },
];

// Header for pages outside the dashboard (sign in, invites, the agent
// consent screen). `social` puts the Discord, X and GitHub marks beside the
// brand: a self-hosted install has no landing page, so the sign-in page is
// where its users find the community.
export function PublicHeader({ right, social }: { right?: React.ReactNode; social?: boolean }) {
  return (
    <header className="zq-top">
      <div className="zq-top-left">
        <a href="/" className="zq-brand" aria-label="Zeqqat home">
          <span className="zq-logo" aria-hidden="true">
            Z
          </span>
          <span className="zq-name">zeqqat</span>
        </a>
        {social ? (
          <nav className="zq-top-social" aria-label="Community">
            {SOCIAL.filter((s) => s.href).map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noreferrer noopener" aria-label={`Zeqqat on ${s.name}`} title={s.name}>
                <span
                  className="zq-mono-logo"
                  style={{ maskImage: `url(${s.logo})`, WebkitMaskImage: `url(${s.logo})` }}
                  aria-hidden="true"
                />
              </a>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="zq-top-right">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}
