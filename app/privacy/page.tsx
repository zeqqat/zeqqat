import type { Metadata } from "next";
import { PublicHeader } from "../../components/PublicHeader";

export const metadata: Metadata = { title: "Privacy" };

// Plain-language privacy notice for the hosted zeqqat.com. A self-hosted
// install keeps everything on its own server and is governed by whoever runs it.
export default function Privacy() {
  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">Legal</p>
        <h1 className="zq-h">
          Privacy<span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          This covers the hosted service at zeqqat.com. If you self-host Zeqqat, your data stays on your own server
          and this page does not apply to it.
        </p>

        <section className="zq-block">
          <h2 className="zq-block-t">What we store</h2>
          <ul className="zq-steps">
            <li>Your account: the name, email address and profile picture your sign-in provider shares with us, and your username.</li>
            <li>
              The API keys you add for your Dokploy instances. They are encrypted before they are stored and are never
              shown to you, to anyone else, or to any AI agent.
            </li>
            <li>
              A log of what your agents do through Zeqqat: which tool was called, when, by which agent, the reason it
              gave, and the request and response with secrets removed. This is the Activity log you see in the dashboard.
            </li>
          </ul>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">What we do with it</h2>
          <ul className="zq-steps">
            <li>We use it only to run the service for you: sign you in, make the calls your agents ask for, and show you the log.</li>
            <li>We do not sell your data and we do not use it to train AI models.</li>
            <li>
              Website analytics use a self-hosted Umami instance that sets no cookies and does not track you across
              sites.
            </li>
          </ul>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">Your choices</h2>
          <ul className="zq-steps">
            <li>You can remove your Dokploy keys from the dashboard at any time.</li>
            <li>
              To delete your account and its data, or for any privacy question, open an issue at
              github.com/zeqqat/zeqqat or report it privately through the repository&rsquo;s Security tab.
            </li>
          </ul>
        </section>

        <p className="zq-note">Last updated November 2026. Zeqqat is in beta and this page may change as it grows.</p>
      </main>
    </div>
  );
}
