import type { Metadata } from "next";
import { PublicHeader } from "../../../components/PublicHeader";

export const metadata: Metadata = { title: "Self-host Zeqqat on Dokploy" };

// The guide the self-host prompt points agents at, and the manual path for
// people who'd rather do it by hand. Written as numbered steps an agent can
// follow with Dokploy's own API.
export default function SelfHostGuide() {
  return (
    <div className="zq">
      <PublicHeader />
      <main className="zq-body" style={{ maxWidth: 760 }}>
        <p className="zq-kicker">Guide</p>
        <h1 className="zq-h">
          Self-host Zeqqat on Dokploy<span className="dot">.</span>
        </h1>
        <p className="zq-sub">
          Zeqqat is one app and a Postgres database, shipped as a Docker image. On Dokploy it&rsquo;s a single Docker
          Compose service. It applies its own database migrations when it starts.
        </p>

        <section className="zq-block">
          <h2 className="zq-block-t">1. Create the compose service</h2>
          <ol className="zq-steps">
            <li>
              Create a project called <b>zeqqat</b>, and in it a <b>Docker Compose</b> service.
            </li>
            <li>
              Use the <b>docker-compose.yml</b> from the Zeqqat repository (github.com/zeqqat/zeqqat), either by
              pointing the service at the repository or by pasting the file.
            </li>
          </ol>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">2. Set the environment and domain</h2>
          <ol className="zq-steps">
            <li>Set the environment variables below on the compose service.</li>
            <li>
              Add your domain (for example <b>zeqqat.example.com</b>) to the <b>zeqqat</b> service on port{" "}
              <b>3000</b> with HTTPS on. Its DNS must point at this Dokploy server.
            </li>
            <li>Deploy, then open the domain and sign in.</li>
          </ol>
          <div className="zq-cbox" style={{ marginTop: 16 }}>
            <div className="zq-cbox-top">
              <span className="zq-cbox-label">Environment</span>
            </div>
            <pre className="zq-cbox-block">{`ZEQQAT_PUBLIC_URL=https://zeqqat.example.com
POSTGRES_PASSWORD=<openssl rand -hex 24>
BETTER_AUTH_SECRET=<openssl rand -base64 32>
ZEQQAT_ENCRYPTION_KEY=<openssl rand -base64 32>
ENABLED_AUTH_PROVIDERS=github
GITHUB_CLIENT_ID=<your GitHub OAuth app>
GITHUB_CLIENT_SECRET=<your GitHub OAuth app secret>`}</pre>
          </div>
          <p className="zq-note">
            Generate the secrets once and keep them. A new <b>ZEQQAT_ENCRYPTION_KEY</b> makes stored Dokploy keys
            unreadable. In your GitHub OAuth app, set the callback URL to{" "}
            <b>https://zeqqat.example.com/api/auth/callback/github</b>. Google sign-in works the same way with{" "}
            <b>GOOGLE_CLIENT_ID</b> and <b>GOOGLE_CLIENT_SECRET</b>.
          </p>
          <p className="zq-note">
            Your install sends zeqqat.com one anonymous ping on start and once a day: a random install id and the
            version, nothing else (no IP, users or keys). Set <b>ZEQQAT_TELEMETRY=0</b> to turn it off.
          </p>
        </section>

        <section className="zq-block">
          <h2 className="zq-block-t">3. Connect your agents</h2>
          <ol className="zq-steps">
            <li>Sign in to your new Zeqqat and connect your Dokploy there.</li>
            <li>
              Copy the connection URL it gives you into each agent, in place of any URL it used before, and sign in
              again.
            </li>
            <li>Optionally, remove your Dokploy keys from the Zeqqat you used before.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
