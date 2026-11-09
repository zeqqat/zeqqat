// Runs the one-button self-host install (lib/selfhost-install.ts) against a
// stand-in Dokploy on localhost and checks every call it makes.
//   pnpm exec tsx tests/e2e/selfhost-install-flow.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  configureStep,
  createStep,
  deployStep,
  InstallError,
  statusStep,
} from "../../lib/selfhost-install";
import { SELFHOST_COMPOSE } from "../../lib/selfhost-compose";

type Call = {
  op: string;
  method: string;
  body: Record<string, unknown> | null;
  query: URLSearchParams;
};
const calls: Call[] = [];
let composeStatus = "idle";
let generatedHost = "zeqqat-abc123-1-2-3-4.sslip.io";
const KEY = "test-key";

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const op = url.pathname.replace(/^\/api\//, "");
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ op, method: req.method ?? "", body, query: url.searchParams });
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.headers["x-api-key"] !== KEY)
      return send(401, { message: "Unauthorized" });
    switch (op) {
      // Newer Dokploy: the project and its default environment.
      case "project.create":
        return send(200, {
          project: { projectId: "p1", name: body.name },
          environment: { environmentId: "e1" },
        });
      case "compose.create":
        return send(200, {
          composeId: "c1",
          appName: "zeqqat-abc123",
          name: body.name,
        });
      case "compose.update":
        return send(200, true);
      case "domain.generateDomain":
        return send(200, generatedHost);
      case "domain.create":
        return send(200, { domainId: "d1" });
      case "compose.deploy":
        return send(200, true);
      case "compose.one":
        return send(200, {
          composeId: "c1",
          appName: "zeqqat-abc123",
          composeStatus,
        });
      default:
        return send(404, { message: `no ${op}` });
    }
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const t = { baseUrl, apiKey: KEY };

  try {
    const created = await createStep(t);
    assert.equal(created.projectId, "p1");
    assert.equal(created.environmentId, "e1");
    assert.equal(created.composeId, "c1");
    assert.equal(created.appName, "zeqqat-abc123");
    assert.equal(
      created.dashboardUrl,
      `${baseUrl}/dashboard/project/p1/environment/e1/services/compose/c1`,
    );
    assert.equal(calls.find((c) => c.op === "compose.create")?.body?.appName, "zeqqat");
    const update = calls.find((c) => c.op === "compose.update");
    assert.equal(update?.body?.sourceType, "raw");
    assert.equal(update?.body?.composeFile, SELFHOST_COMPOSE);
    assert.ok(
      !calls.some((c) => c.op === "project.all"),
      "environment came from project.create",
    );

    const configured = await configureStep(
      t,
      created.composeId,
      created.appName,
    );
    assert.equal(configured.address, "https://zeqqat-abc123-1-2-3-4.sslip.io");
    const domain = calls.find((c) => c.op === "domain.create")?.body;
    assert.deepEqual(
      {
        host: domain?.host,
        port: domain?.port,
        https: domain?.https,
        cert: domain?.certificateType,
        service: domain?.serviceName,
        type: domain?.domainType,
        composeId: domain?.composeId,
      },
      {
        host: "zeqqat-abc123-1-2-3-4.sslip.io",
        port: 3000,
        https: true,
        cert: "letsencrypt",
        service: "zeqqat",
        type: "compose",
        composeId: "c1",
      },
    );
    const envCall = calls.filter((c) => c.op === "compose.update").at(-1)?.body;
    const env = String(envCall?.env);
    assert.match(
      env,
      /^ZEQQAT_PUBLIC_URL=https:\/\/zeqqat-abc123-1-2-3-4\.sslip\.io$/m,
    );
    assert.match(env, /^POSTGRES_PASSWORD=[0-9a-f]{48}$/m);
    assert.match(env, /^BETTER_AUTH_SECRET=[A-Za-z0-9+/=]{44}$/m);
    assert.match(env, /^ZEQQAT_ENCRYPTION_KEY=[A-Za-z0-9+/=]{44}$/m);

    // Fresh secrets every install.
    const again = await configureStep(t, "c1", "zeqqat-abc123");
    assert.ok(again.ok);
    const env2 = String(
      calls.filter((c) => c.op === "compose.update").at(-1)?.body?.env,
    );
    assert.notEqual(env, env2);

    await deployStep(t, "c1");
    assert.equal(
      calls.find((c) => c.op === "compose.deploy")?.body?.composeId,
      "c1",
    );

    composeStatus = "running";
    assert.equal(
      (await statusStep(t, "c1", configured.address)).deploy,
      "running",
    );
    composeStatus = "error";
    assert.equal(
      (await statusStep(t, "c1", configured.address)).deploy,
      "error",
    );
    composeStatus = "idle";
    assert.equal(
      (await statusStep(t, "c1", configured.address)).deploy,
      "queued",
    );

    // A bad key is said in plain words, not thrown as a crash.
    await assert.rejects(
      createStep({ baseUrl, apiKey: "wrong" }),
      (err: unknown) => {
        assert.ok(err instanceof InstallError);
        assert.match((err as Error).message, /refused the API key/);
        return true;
      },
    );

    // Dokploy without a known server IP: refuse before creating a dead domain.
    generatedHost = "zeqqat-abc123-127-0-0-1.sslip.io";
    const domainsBefore = calls.filter((c) => c.op === "domain.create").length;
    await assert.rejects(configureStep(t, "c1", "zeqqat-abc123"), /public IP/);
    assert.equal(calls.filter((c) => c.op === "domain.create").length, domainsBefore);

    console.log("selfhost install flow: ok");
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
