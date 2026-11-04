import type { Metadata } from "next";
import { PublicHeader } from "../../components/PublicHeader";

export const metadata: Metadata = { title: "Terms" };

// Plain-language terms for the hosted zeqqat.com. The code itself is under
// the Apache License 2.0; these terms cover only the hosted service.
export default function Terms() {
  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">Legal</p>
        <h1 className="zq-h">
          Terms<span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          These terms cover the hosted service at zeqqat.com. The Zeqqat source code is open source under the Apache
          License 2.0, and self-hosted installs are run by whoever installs them.
        </p>

        <section className="zq-block">
          <h2 className="zq-block-t">The service</h2>
          <ul className="zq-steps">
            <li>zeqqat.com is free while in beta. We will tell you before that changes.</li>
            <li>
              It is provided as is, without warranties. We work to keep it available and secure, but we cannot promise
              it will never be down or never have bugs.
            </li>
            <li>
              Zeqqat acts on your Dokploy servers only through the keys you add and the permissions you set. You are
              responsible for what you allow your agents to do.
            </li>
          </ul>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">Your use</h2>
          <ul className="zq-steps">
            <li>Only connect servers and keys you are allowed to use.</li>
            <li>Do not use Zeqqat to attack, overload or get unauthorized access to any system, including zeqqat.com itself.</li>
            <li>We may suspend accounts that break these terms or put other users at risk.</li>
          </ul>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">Leaving</h2>
          <ul className="zq-steps">
            <li>You can stop using zeqqat.com at any time, or move to your own self-hosted install.</li>
          </ul>
        </section>

        <p className="zq-note">Last updated November 2026. See also the <a href="/privacy">privacy notice</a>.</p>
      </main>
    </div>
  );
}
