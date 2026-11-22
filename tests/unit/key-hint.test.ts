import { describe, expect, it } from "vitest";
import { keyHint } from "../../lib/key-hint";
import { isFreeAddress, projectNameFor } from "../../lib/selfhost-names";

describe("keyHint", () => {
  it("keeps the prefix set in Dokploy and the last 4", () => {
    expect(keyHint("zqprod_AbCdEfGhIjKlMnOpQrStUvWxa91f")).toEqual({ start: "zqprod_", end: "a91f" });
  });
  it("shows the first 4 when there is no prefix", () => {
    expect(keyHint("AbCdEfGhIjKlMnOpQrStUvWx")).toEqual({ start: "AbCd", end: "UvWx" });
  });
  it("gives little away for short keys", () => {
    expect(keyHint("short")).toEqual({ start: "", end: "" });
    expect(keyHint("abcdefghij")).toEqual({ start: "", end: "ij" });
  });
});

describe("self-host names", () => {
  it("names the project after its address", () => {
    expect(projectNameFor("zeqqat-ab12cd-13-53-192-23.sslip.io")).toBe("Zeqqat | ....ab12cd-13-53-192-23.sslip.io");
    expect(projectNameFor(undefined)).toBe("zeqqat");
  });
  it("only takes addresses Dokploy could have made", () => {
    expect(isFreeAddress("zeqqat-ab12cd-13-53-192-23.sslip.io")).toBe(true);
    expect(isFreeAddress("zeqqat-ab12cd-127-0-0-1.sslip.io")).toBe(false);
    expect(isFreeAddress("evil.com")).toBe(false);
  });
});
