import { describe, expect, it } from "vitest";
import { buildRequest, staysOnInstance } from "../../lib/executor";

const ep = (path: string) => ({ method: "GET", path, pathParams: [] });
const base = "https://dokploy.example.com";

describe("staysOnInstance", () => {
  it("allows the instance's own paths", () => {
    const { url } = buildRequest(base, ep("/api/application.one"), { applicationId: "x" });
    expect(staysOnInstance(url, base)).toBe(true);
  });

  it("refuses a protocol-relative path that would change the host", () => {
    const { url } = buildRequest(base, ep("//evil.example/steal"), {});
    expect(url.host).toBe("evil.example");
    expect(staysOnInstance(url, base)).toBe(false);
  });

  it("refuses an absolute URL as a path", () => {
    const { url } = buildRequest(base, ep("https://evil.example/steal"), {});
    expect(staysOnInstance(url, base)).toBe(false);
  });

  it("refuses a scheme change on the same host", () => {
    const { url } = buildRequest(base, ep("http://dokploy.example.com/api/x"), {});
    expect(staysOnInstance(url, base)).toBe(false);
  });

  it("keeps path params encoded so inputs can't move the host", () => {
    const { url } = buildRequest(base, { method: "GET", path: "/api/{id}", pathParams: ["id"] }, { id: "//evil.example" });
    expect(staysOnInstance(url, base)).toBe(true);
  });
});
