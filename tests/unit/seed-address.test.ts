import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({ db: {} }));

import { requestOrigin, withPublicUrl } from "../../lib/seed-claim";

describe("claiming on a domain added in Dokploy", () => {
  it("replaces ZEQQAT_PUBLIC_URL and keeps everything else", () => {
    const env = "A=1\nZEQQAT_PUBLIC_URL=https://zeqqat-ab12-1-2-3-4.sslip.io\nB=2";
    expect(withPublicUrl(env, "https://zeqqat.example.com")).toBe("A=1\nB=2\nZEQQAT_PUBLIC_URL=https://zeqqat.example.com");
  });

  it("reads the origin the request came on", () => {
    const h = new Headers({ "x-forwarded-proto": "https", host: "Zeqqat.Example.com" });
    expect(requestOrigin(h)).toBe("https://zeqqat.example.com");
    expect(requestOrigin(new Headers({ host: "x" }))).toBeNull();
  });
});
