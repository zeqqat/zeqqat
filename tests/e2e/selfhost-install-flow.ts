// Runs the one-button self-host install (lib/selfhost-install.ts) against a
// stand-in Dokploy on localhost and checks every call it makes.
//   pnpm exec tsx tests/e2e/selfhost-install-flow.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  configureStep,
  createKeyStep,
  createStep,
  previewAddress,
  deployStep,
  InstallError,
  statusStep,
} from "../../lib/selfhost-install";
import { SELFHOST_COMPOSE } from "../../lib/selfhost-compose";
import { deleteOwnKey, dokployKeyHash } from "../../lib/dokploy-keys";

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
    if (req.headers["x-api-key"] !== KEY && !dokployKeys.some((k) => k.plain === req.headers["x-api-key"]))
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
      case "organization.active":
        return send(200, { id: "org1", name: "Default" });
      case "user.getBackups":
        if (!keysWithHashes) return send(403, { message: "admins only" });
        return send(200, { id: "u1", backups: [], apiKeys: dokployKeys.map((k) => ({ ...k, start: k.prefix.slice(0, 6), key: dokployKeyHash(k.plain) })) });
      case "user.get":
        return send(200, { id: "m1", user: { id: "u1", apiKeys: dokployKeys.map(({ plain: _p, ...k }) => k) } });
      case "user.deleteApiKey":
        dokployKeys = dokployKeys.filter((k) => k.id !== body.apiKeyId);
        return send(200, true);
      case "user.createApiKey":
        return send(200, { id: "k1", key: `${body.prefix}newkey1234567890`, name: body.name });
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

let dokployKeys: { id: string; name: string; prefix: string; createdAt: string; plain: string }[] = [];
let keysWithHashes = true;

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

    // The page asks for the address first; the project is named after it and
    // step 2 uses exactly that address, without asking Dokploy again.
    const preview = await previewAddress(t);
    assert.equal(preview, "zeqqat-abc123-1-2-3-4.sslip.io");
    calls.length = 0;
    await createStep(t, preview);
    assert.equal(calls.find((c) => c.op === "project.create")?.body?.name, "Zeqqat | ....abc123-1-2-3-4.sslip.io");
    const pinned = await configureStep(t, "c1", "zeqqat-abc123", "zeqqat-zz9999-1-2-3-4.sslip.io");
    assert.equal(pinned.address, "https://zeqqat-zz9999-1-2-3-4.sslip.io");
    assert.ok(!calls.some((c) => c.op === "domain.generateDomain"), "used the previewed address");

    // A key of the install's own, tied to Dokploy's organization.
    const newKey = await createKeyStep(t);
    assert.equal(newKey, "zqself_newkey1234567890");
    const made = calls.find((c) => c.op === "user.createApiKey")?.body;
    assert.deepEqual(made?.metadata, { organizationId: "org1" });
    assert.equal(made?.prefix, "zqself_");

    // The caller fixes the encryption key and adds the seed.
    await configureStep(t, "c1", "zeqqat-abc123", undefined, { encryptionKey: "K".repeat(44), env: { ZEQQAT_SEED: "abc" } });
    const seeded = String(calls.filter((c) => c.op === "compose.update").at(-1)?.body?.env);
    assert.match(seeded, /^ZEQQAT_ENCRYPTION_KEY=K{44}$/m);
    assert.match(seeded, /^ZEQQAT_SEED=abc$/m);

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

    // zeqqat.com's own key deletes itself: found by its hash when Dokploy
    // returns hashes (user.getBackups), else by the longest prefix.
    const others = [
      { id: "k-dev", name: "For zeqqat dev", prefix: "zeqqat_dev", createdAt: "2026-10-26T04:05:03Z", plain: "zeqqat_devAAAA" },
      { id: "k-z", name: "For zeqqat dev 2", prefix: "z_dev", createdAt: "2026-11-09T07:50:58Z", plain: "z_devBBBB" },
    ];
    const cloudKey = { id: "k-main", name: "Zeqqat Main MCP", prefix: "zeqqat_main", createdAt: "2026-11-08T17:27:52Z", plain: "zeqqat_mainCCCCDDDD" };
    dokployKeys = [...others, cloudKey];
    keysWithHashes = true;
    assert.deepEqual(await deleteOwnKey({ baseUrl, apiKey: cloudKey.plain }), { deleted: true });
    assert.deepEqual(dokployKeys.map((k) => k.id), ["k-dev", "k-z"], "deleted by hash, the others untouched");

    dokployKeys = [...others, cloudKey];
    keysWithHashes = false;
    assert.deepEqual(await deleteOwnKey({ baseUrl, apiKey: cloudKey.plain }), { deleted: true });
    assert.deepEqual(dokployKeys.map((k) => k.id), ["k-dev", "k-z"], "deleted by longest prefix");

    const twin = { ...cloudKey, id: "k-twin", plain: "zeqqat_mainEEEE" };
    dokployKeys = [...others, cloudKey, twin];
    const asked = await deleteOwnKey({ baseUrl, apiKey: cloudKey.plain });
    assert.ok("pick" in asked && asked.pick.length === 2, "two keys share the prefix: the owner picks");
    await assert.rejects(deleteOwnKey({ baseUrl, apiKey: cloudKey.plain }, "not-a-key"), /isn't one of your Dokploy keys/);
    assert.deepEqual(await deleteOwnKey({ baseUrl, apiKey: cloudKey.plain }, "k-main"), { deleted: true });
    assert.deepEqual(dokployKeys.map((k) => k.id).sort(), ["k-dev", "k-twin", "k-z"]);

    dokployKeys = [...others];
    keysWithHashes = true;
    await assert.rejects(deleteOwnKey({ baseUrl, apiKey: KEY }), /couldn.t find its key/);

    console.log("selfhost install flow: ok");
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
