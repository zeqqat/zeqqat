"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function GatewayLanding() {
  return (
    <div className="zq">
      <style>{`
.zq{
  --bg:#F7F8FA;--panel:#FFFFFF;--fg:#0D141A;--dim:#5A6B78;--faint:#7C8C99;--ghost:#A4B2BC;
  --line:#E1E7EC;--line2:#CFD8E0;
  --cobalt:#2E6FE0;--mint:#1E9E82;
  min-height:100svh;width:100%;overflow-x:clip;
  background:var(--bg);color:var(--fg);
  font-family:var(--font-mono),ui-monospace,monospace;
  display:grid;grid-template-rows:auto 1fr auto;
  -webkit-font-smoothing:antialiased;
  transition:background .18s ease,color .18s ease;
}
@media(prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .zq{
    --bg:#0C1116;--panel:#111A21;--fg:#F2F5F7;--dim:#7B8C99;--faint:#4E5F6C;--ghost:#3C4A55;
    --line:#1C262E;--line2:#28343E;
    --cobalt:#5C9BFF;--mint:#4ECBAE;
  }
}
:root[data-theme="dark"] .zq{
  --bg:#0C1116;--panel:#111A21;--fg:#F2F5F7;--dim:#7B8C99;--faint:#4E5F6C;--ghost:#3C4A55;
  --line:#1C262E;--line2:#28343E;
  --cobalt:#5C9BFF;--mint:#4ECBAE;
}
.zq *{box-sizing:border-box;min-width:0;}
.zq a{color:inherit;text-decoration:none;}
.zq :focus-visible{outline:2px solid var(--cobalt);outline-offset:3px;}

.zq-top{position:sticky;top:0;z-index:30;display:flex;justify-content:space-between;
  align-items:center;gap:18px;padding:20px 26px;font-size:12.5px;
  background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);}
@media(max-width:480px){.zq-top{padding:16px 18px;}}
.zq-top-left{display:flex;align-items:center;gap:22px;}
.zq-brand{display:flex;align-items:center;gap:10px;}
.zq-logo{width:28px;height:28px;border-radius:6px;background:var(--cobalt);color:#08121F;
  display:grid;place-items:center;font-family:var(--font-display),sans-serif;font-weight:800;
  font-size:17px;line-height:1;letter-spacing:-.02em;flex:0 0 auto;}
.zq-name{font-family:var(--font-display),sans-serif;font-weight:800;font-size:16px;letter-spacing:-.01em;color:var(--fg);}
.zq-nav{display:flex;gap:20px;color:var(--dim);}
.zq-nav a:hover{color:var(--fg);}
@media(max-width:640px){.zq-nav{display:none;}}
.zq-top-right{display:flex;align-items:center;gap:20px;}
@media(max-width:480px){.zq-top-right{gap:16px;}}
.zq-link{font-family:inherit;background:none;border:0;padding:0;cursor:pointer;color:var(--dim);font-size:inherit;}
.zq-link:hover{color:var(--fg);}
.zq-link-strong{color:var(--fg);}
.zq-link-strong:hover{color:var(--cobalt);}
.zq-theme{background:none;border:0;padding:0;cursor:pointer;color:var(--dim);display:grid;place-items:center;}
.zq-theme:hover{color:var(--fg);}
.zq-theme svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;}

.zq-mid{display:flex;justify-content:center;padding:22px 26px 64px;}
@media(max-width:480px){.zq-mid{padding:10px 18px 40px;}}
.zq-in{width:100%;max-width:680px;padding-top:38px;}
@media(max-width:480px){.zq-in{padding-top:22px;}}

.zq-mark{font-family:var(--font-display),sans-serif;font-weight:800;font-size:clamp(38px,8vw,68px);
  line-height:1.05;letter-spacing:-.03em;margin:0;text-align:center;}
.zq-mark .dot{color:var(--mint);animation:zqb 1.1s steps(1) infinite;}
@keyframes zqb{0%,50%{opacity:1}51%,100%{opacity:.2}}
.zq-tagline{font-size:clamp(14.5px,3.2vw,17px);color:var(--dim);margin:20px auto 0;letter-spacing:-.01em;
  text-align:center;max-width:52ch;line-height:1.65;}
.zq-tagline b{color:var(--fg);font-weight:600;}

.zq-lead{text-align:center;font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--faint);margin:52px 0 18px;}
.zq-icons{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;}
.zq-chip{width:48px;height:48px;border-radius:6px;display:grid;place-items:center;
  box-shadow:0 1px 0 hsla(0,0%,100%,.14) inset;}
.zq-chip img{width:56%;height:56%;object-fit:contain;display:block;}

.zq-paths{margin-top:52px;}
.zq-path{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:4px;
  background:rgba(92,155,255,.06);padding:13px 16px;transition:border-color .15s ease;}
.zq-path:hover{border-color:color-mix(in srgb,var(--cobalt) 45%,var(--line));}
.zq-path+.zq-path{margin-top:10px;}
.zq-path-ic{width:26px;height:26px;border-radius:5px;background:rgba(92,155,255,.14);color:var(--cobalt);
  display:grid;place-items:center;flex:0 0 auto;}
.zq-path-ic svg{width:14px;height:14px;}
.zq-path-t{font-size:13.5px;color:var(--fg);}
.zq-path-d{font-size:11.5px;color:var(--faint);margin-top:2px;}
.zq-path-go{margin-left:auto;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--cobalt);flex:0 0 auto;}

.zq-foot{border-top:1px solid var(--line);padding:18px 26px;display:flex;justify-content:space-between;
  align-items:center;gap:10px 18px;flex-wrap:wrap;font-size:11.5px;color:var(--faint);}
@media(max-width:480px){.zq-foot{padding:16px 18px;font-size:11px;}}
.zq-foot a:hover{color:var(--dim);}

@media(prefers-reduced-motion:reduce){.zq-mark .dot{animation:none;}}
      `}</style>

      <header className="zq-top">
        <div className="zq-top-left">
          <Link href="/" className="zq-brand" aria-label="Zeqqat home">
            <span className="zq-logo" aria-hidden="true">
              Z
            </span>
            <span className="zq-name">zeqqat</span>
          </Link>
          <nav className="zq-nav" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#docs">Docs</a>
          </nav>
        </div>
        <div className="zq-top-right">
          <a className="zq-link" href="#signin">
            Sign in
          </a>
          <a className="zq-link zq-link-strong" href="#signup">
            Sign up
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="zq-mid">
        <main className="zq-in" id="main">
          <h1 className="zq-mark">
            One endpoint for
            <br />
            all your MCP servers
            <span className="dot">.</span>
          </h1>
          <p className="zq-tagline">
            Connect once and reach every MCP server you&rsquo;ve integrated. See what your agents
            are doing, decide what they&rsquo;re allowed to do, and extend the same access to your
            team. Bring any agent: <b>Claude</b>, <b>Cursor</b>, <b>ChatGPT</b>, or your own.
          </p>

          <p className="zq-lead">Runs on</p>
          <div className="zq-icons">
            <span className="zq-chip" style={{ background: "#6B16ED" }}>
              <img src="/logos/coolify.svg" alt="Coolify" />
            </span>
            <span className="zq-chip" style={{ background: "#12141A" }}>
              <img src="/logos/dokploy.svg" alt="Dokploy" />
            </span>
            <span className="zq-chip" style={{ background: "#F38020" }}>
              <img src="/logos/cloudflare.svg" alt="Cloudflare" />
            </span>
            <span className="zq-chip" style={{ background: "#242424" }}>
              <img src="/logos/tailscale.svg" alt="Tailscale" />
            </span>
            <span className="zq-chip" style={{ background: "#673DE6" }}>
              <img src="/logos/hostinger.svg" alt="Hostinger" />
            </span>
            <span className="zq-chip" style={{ background: "#D50C2D" }}>
              <img src="/logos/hetzner.svg" alt="Hetzner" />
            </span>
          </div>

          <div className="zq-paths" id="how">
            <p className="zq-lead" style={{ margin: "0 0 18px" }}>
              Pick how you run it
            </p>
            <a className="zq-path" href="#signin">
              <span className="zq-path-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 17a3.6 3.6 0 0 1-.6-7.15 4.6 4.6 0 0 1 8.85-1.7A3.9 3.9 0 0 1 20 11.6a3.4 3.4 0 0 1-1 5.4H6.5z" />
                </svg>
              </span>
              <span>
                <span className="zq-path-t">Cloud</span>
                <div className="zq-path-d">Hosted for you, sign up and connect</div>
              </span>
              <span className="zq-path-go">Start &rarr;</span>
            </a>
            <a className="zq-path" href="#docs">
              <span className="zq-path-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="6.5" rx="1.6" />
                  <rect x="4" y="13.5" width="16" height="6.5" rx="1.6" />
                  <path d="M8 7.3h.01M8 16.8h.01" />
                </svg>
              </span>
              <span>
                <span className="zq-path-t">Self-hosted</span>
                <div className="zq-path-d">Run it on your own infrastructure</div>
              </span>
              <span className="zq-path-go">Docs &rarr;</span>
            </a>
          </div>
        </main>
      </div>

      <footer className="zq-foot">
        <span>© {new Date().getFullYear()} Zeqqat</span>
        <nav className="zq-foot-links" aria-label="Footer">
          <a href="#docs">Docs</a>
        </nav>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const [effective, setEffective] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") {
      setEffective(stored);
      return;
    }
    setEffective(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function toggle() {
    const next = effective === "dark" ? "light" : "dark";
    setEffective(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button
      className="zq-theme"
      onClick={toggle}
      aria-label={effective === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      style={{ width: 16, height: 16 }}
    >
      {effective === null ? null : effective === "dark" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z" />
        </svg>
      )}
    </button>
  );
}
