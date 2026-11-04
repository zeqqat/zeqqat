"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { connection } from "../../db/schema";
import { createAuthorizationCode } from "../oauth";
import { getServerSession } from "../session";
import { sunsetState } from "../connections";
import { workspaceRoleFor } from "../workspace";

export async function authorizeAction(formData: FormData) {
  const oauthClientId = formData.get("oauth_client_id")?.toString();
  const redirectUri = formData.get("redirect_uri")?.toString();
  const state = formData.get("state")?.toString() ?? "";
  const codeChallenge = formData.get("code_challenge")?.toString();
  const scope = formData.get("scope")?.toString() ?? "mcp";

  // These were already validated (client exists, redirect_uri registered,
  // S256 challenge present) by the page before it ever rendered a form with
  // these hidden fields, so reaching here with any of them missing means
  // the form was tampered with or something upstream is broken — refuse
  // rather than guess.
  if (!oauthClientId || !redirectUri || !codeChallenge) {
    throw new Error("Malformed authorization request");
  }

  const session = await getServerSession();
  if (!session?.user) redirect("/signin");

  // Signing in for a connection URL: the connection fixes the workspace,
  // and the person must be in that workspace. Re-checked here, not trusted
  // from the page.
  const connectionId = formData.get("connection_id")?.toString() || null;
  if (!connectionId) throw new Error("Sign-ins are always for one connection URL");
  const conn = await db.query.connection.findFirst({
    where: and(eq(connection.id, connectionId), isNull(connection.deletedAt)),
  });
  if (!conn || sunsetState(conn) === "cutoff" || conn.authMode !== "members") throw new Error("Unknown connection");
  if (!(await workspaceRoleFor(session.user.id, conn.workspaceId))) throw new Error("Not a member of this workspace");
  const workspaceId = conn.workspaceId;

  const code = await createAuthorizationCode({
    oauthClientId,
    userId: session.user.id,
    workspaceId,
    connectionId,
    redirectUri,
    codeChallenge,
    scope,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}

export async function denyAction(formData: FormData) {
  const redirectUri = formData.get("redirect_uri")?.toString();
  const state = formData.get("state")?.toString() ?? "";

  if (!redirectUri) {
    redirect("/");
  }

  const url = new URL(redirectUri);
  url.searchParams.set("error", "access_denied");
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}
