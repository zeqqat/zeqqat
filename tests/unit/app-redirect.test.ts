import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/session", () => ({ getServerSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("../../lib/workspace", () => ({
  getUserWorkspace: async () => ({ organizationSlug: "gaita", workspaceSlug: "default" }),
}));

// Behind Dokploy's proxy the request URL is the container's own address.
// The redirect must never carry it.
describe("/app redirect", () => {
  it("sends a relative Location, never the container's host", async () => {
    const { GET } = await import("../../app/app/[[...rest]]/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("https://0.0.0.0:3000/app/team?x=1");
    const res = await GET(req, { params: Promise.resolve({ rest: ["team"] }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/gaita/default/members?x=1");
  });
});
