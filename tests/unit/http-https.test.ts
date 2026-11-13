import { describe, expect, it } from "vitest";
import { flippedUrl, requestScheme, servedWithoutHttps, usesFlippedScheme } from "../../lib/auth-scheme";
import { canGetCertificate, envWithHttps } from "../../lib/self-https";

const h = (o: Record<string, string>) => new Headers(o);

describe("which sign-in setup a request uses", () => {
  const url = "https://zq.example";

  it("reads the scheme from the proxy", () => {
    expect(requestScheme(h({ "x-forwarded-proto": "http" }))).toBe("http");
    expect(requestScheme(h({ "x-forwarded-proto": "https,http" }))).toBe("https");
    expect(requestScheme(h({}))).toBeNull();
  });

  it("flips only for the install's own host on the other scheme", () => {
    expect(usesFlippedScheme(url, h({ host: "zq.example", "x-forwarded-proto": "http" }))).toBe(true);
    expect(usesFlippedScheme(url, h({ host: "zq.example", "x-forwarded-proto": "https" }))).toBe(false);
    expect(usesFlippedScheme(url, h({ host: "evil.example", "x-forwarded-proto": "http" }))).toBe(false);
    expect(usesFlippedScheme(url, h({ host: "zq.example" }))).toBe(false);
    expect(usesFlippedScheme("http://zq.example", h({ "x-forwarded-host": "zq.example", "x-forwarded-proto": "https" }))).toBe(true);
    expect(usesFlippedScheme(undefined, h({ host: "zq.example", "x-forwarded-proto": "http" }))).toBe(false);
  });

  it("flips the URL's scheme", () => {
    expect(flippedUrl("https://zq.example")).toBe("http://zq.example");
    expect(flippedUrl("http://zq.example:8080/")).toBe("https://zq.example:8080");
    expect(flippedUrl("not a url")).toBeNull();
  });
});

describe("the Turn on HTTPS banner", () => {
  it("shows over http on a real address, not on this machine", () => {
    expect(servedWithoutHttps(h({ host: "zq.example", "x-forwarded-proto": "http" }))).toBe(true);
    expect(servedWithoutHttps(h({ host: "zq.example", "x-forwarded-proto": "https" }))).toBe(false);
    expect(servedWithoutHttps(h({ host: "localhost:3000", "x-forwarded-proto": "http" }))).toBe(false);
    expect(servedWithoutHttps(h({ host: "zq.example" }))).toBe(false);
  });

  it("offers the button only where Let's Encrypt can issue", () => {
    expect(canGetCertificate("zeqqat-ab12cd-13-53-192-23.sslip.io")).toBe(true);
    expect(canGetCertificate("zeqqat.mycompany.com")).toBe(true);
    expect(canGetCertificate("zeqqat-ab12cd-13-53-192-23.traefik.me")).toBe(false);
    expect(canGetCertificate("13.53.192.23")).toBe(false);
    expect(canGetCertificate("localhost")).toBe(false);
  });

  it("moves ZEQQAT_PUBLIC_URL to https and leaves the rest alone", () => {
    const env = "POSTGRES_PASSWORD=x\nZEQQAT_PUBLIC_URL=http://zq.example\nBETTER_AUTH_SECRET=y";
    expect(envWithHttps(env, "zq.example")).toBe("POSTGRES_PASSWORD=x\nZEQQAT_PUBLIC_URL=https://zq.example\nBETTER_AUTH_SECRET=y");
    expect(envWithHttps('ZEQQAT_PUBLIC_URL="http://zq.example/"', "zq.example")).toBe('ZEQQAT_PUBLIC_URL="https://zq.example"');
    expect(envWithHttps("ZEQQAT_PUBLIC_URL=https://zq.example", "zq.example")).toBeNull();
    expect(envWithHttps("ZEQQAT_PUBLIC_URL=http://other.example", "zq.example")).toBeNull();
  });
});
