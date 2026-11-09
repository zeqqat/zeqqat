import { describe, expect, it } from "vitest";
import { checkAddress, checkPort, classifyError, classifyStatus, normalizeAddress } from "../../lib/reachability";

// zeqqat_check: what an address or port looks like from the internet.
describe("reachability", () => {
  it("sorts failures into outcomes a person can act on", () => {
    expect(classifyError("ETIMEDOUT")).toBe("unreachable");
    expect(classifyError("ECONNREFUSED")).toBe("unreachable");
    expect(classifyError("DEPTH_ZERO_SELF_SIGNED_CERT")).toBe("certificate_not_ready");
    expect(classifyError("ERR_TLS_CERT_ALTNAME_INVALID")).toBe("certificate_not_ready");
    expect(classifyError("ENOTFOUND")).toBe("not_found");
  });

  it("counts redirects as live and 4xx/5xx as an error page", () => {
    expect(classifyStatus(200)).toBe("live");
    expect(classifyStatus(307)).toBe("live");
    expect(classifyStatus(404)).toBe("error_page");
    expect(classifyStatus(502)).toBe("error_page");
  });

  it("takes a bare host or an http(s) URL on 80/443, and nothing else", () => {
    expect(normalizeAddress("zeqqat.example.org")?.href).toBe("https://zeqqat.example.org/");
    expect(normalizeAddress("http://zeqqat.example.org/some/path?q=1")?.href).toBe("http://zeqqat.example.org/");
    expect(normalizeAddress("https://zeqqat.example.org:8080")).toBeNull();
    expect(normalizeAddress("https://user:pw@zeqqat.example.org")).toBeNull();
    expect(normalizeAddress("")).toBeNull();
  });

  it("never touches a private or loopback address", async () => {
    const r = await checkAddress("http://127.0.0.1");
    expect(r?.outcome).toBe("unreachable");
    expect(r?.resolvedIp).toBeUndefined();
    const meta = await checkAddress("http://169.254.169.254");
    expect(meta?.resolvedIp).toBeUndefined();
    await expect(checkPort("10.0.0.5", 22)).rejects.toThrow();
  });

  it("only checks SSH, web and Dokploy dashboard ports", async () => {
    await expect(checkPort("93.184.215.14", 5432)).rejects.toThrow();
  });
});
