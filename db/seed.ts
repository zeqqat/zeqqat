import { TransactionRollbackError } from "drizzle-orm";
import { db } from "./index";
import { newId } from "../lib/id";
import { compileEndpointName } from "../lib/tool-names";
import * as schema from "./schema";

// Inserts one row per table inside a transaction that rolls back at the end.
// Proves every foreign key in the schema resolves. Not meant to leave data
// behind — run it, watch it succeed, then check the DB is still empty.
async function main() {
  await db.transaction(async (tx) => {
    const userId = newId();
    await tx.insert(schema.user).values({
      id: userId,
      name: "Seed User",
      email: "seed@example.com",
      emailVerified: true,
    });

    await tx.insert(schema.session).values({
      id: newId(),
      userId,
      token: "seed-session-token",
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await tx.insert(schema.account).values({
      id: newId(),
      userId,
      accountId: "google-sub-123",
      providerId: "google",
    });

    await tx.insert(schema.verification).values({
      id: newId(),
      identifier: "seed@example.com",
      value: "code",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const organizationId = newId();
    await tx.insert(schema.organization).values({
      id: organizationId,
      slug: "seed",
      displayName: "Seed",
      kind: "personal",
      ownerUserId: userId,
    });

    const workspaceId = newId();
    await tx.insert(schema.workspace).values({
      id: workspaceId,
      organizationId,
      slug: "default",
      name: "Default",
    });

    await tx.insert(schema.membership).values({
      id: newId(),
      userId,
      organizationId,
      role: "owner",
    });

    const oauthClientId = newId();
    await tx.insert(schema.oauthClient).values({
      id: oauthClientId,
      clientId: "seed-client-id",
      clientName: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      softwareId: "claude",
    });

    const grantId = newId();
    await tx.insert(schema.oauthGrant).values({
      id: grantId,
      oauthClientId,
      userId,
      organizationId,
      workspaceId,
      scope: "mcp",
    });

    await tx.insert(schema.oauthToken).values({
      id: newId(),
      grantId,
      kind: "access",
      tokenHash: "seed-token-hash",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await tx.insert(schema.oauthAuthorizationCode).values({
      id: newId(),
      codeHash: "seed-code-hash",
      oauthClientId,
      userId,
      workspaceId,
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      codeChallenge: "seed-challenge",
      scope: "mcp",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const integrationId = newId();
    await tx.insert(schema.integration).values({
      id: integrationId,
      organizationId,
      slug: "dokploy",
      name: "Dokploy",
      official: true,
    });

    const snapshotId = newId();
    await tx.insert(schema.integrationApiSpecSnapshot).values({
      id: snapshotId,
      organizationId,
      integrationId,
      release: "v0.28.0",
      hash: "seed-sha256",
      sourceUrl: "https://dokploy.example.com/openapi.json",
      rawSpec: { seed: true },
    });

    const endpointId = newId();
    await tx.insert(schema.apiEndpoint).values({
      id: endpointId,
      organizationId,
      integrationId,
      lastSnapshotId: snapshotId,
      name: "application.stop",
      ...(() => {
        const n = compileEndpointName({ orgSlug: "seed", integrationSlug: "dokploy", operationId: "application.stop" });
        return { action: n.action, major: n.major };
      })(),
      method: "POST",
      path: "/application.stop",
      tags: ["deploy", "dokploy"],
      inputSchema: { type: "object", properties: { applicationId: { type: "string" } } },
      credentialScheme: { type: "bearer" },
      kind: "edit",
    });

    const instanceId = newId();
    await tx.insert(schema.instance).values({
      id: instanceId,
      workspaceId,
      integrationId,
      alias: "prod",
      baseUrl: "https://dokploy.example.com",
      pinnedSnapshotId: snapshotId,
      protected: true,
      credential: { ciphertext: "seed", iv: "seed", tag: "seed" },
    });

    await tx.insert(schema.instanceGrant).values({
      id: newId(),
      workspaceId,
      instanceId,
      oauthClientId,
    });

    await tx.insert(schema.callLog).values({
      id: newId(),
      organizationId,
      workspaceId,
      oauthClientId,
      userId,
      toolName: "run",
      instanceId,
      apiEndpointId: endpointId,
      outcome: "ok",
      durationMs: 120,
    });

    console.log("Seed proof: all 17 rows inserted, every FK resolved. Rolling back.");
    tx.rollback();
  });
}

main()
  .then(() => console.log("Done."))
  .catch((err) => {
    // The rollback at the end is the intended outcome, not a failure.
    if (err instanceof TransactionRollbackError) {
      console.log("Done.");
      process.exit(0);
    }
    console.error(err);
    process.exit(1);
  });
