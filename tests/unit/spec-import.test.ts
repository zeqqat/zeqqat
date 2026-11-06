import { describe, expect, it } from "vitest";
import { buildRequest } from "../../lib/executor";
import { convertOpenApi } from "../../lib/importer/openapi";
import { defaultBaseUrl, guessKind, guessKinds, ImportError, isPrivateAddress, parseSpec } from "../../lib/spec-import";

// A small spec in the shape most public APIs use: path params, query params
// on a POST, a form body, and bearer auth.
const petstore = {
  openapi: "3.0.3",
  info: { title: "Demo App API", version: "2.1.0" },
  servers: [{ url: "https://api.example.com/v1" }],
  components: { securitySchemes: { token: { type: "http", scheme: "bearer" } } },
  security: [{ token: [] }],
  paths: {
    "/pets": {
      get: { operationId: "listPets", parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }] },
      post: {
        operationId: "createPet",
        parameters: [{ name: "dry_run", in: "query", schema: { type: "boolean" } }],
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } } },
      },
    },
    "/pets/{petId}": {
      get: { operationId: "getPet", parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }] },
      patch: { operationId: "updatePet", parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }] },
      delete: { operationId: "deletePet", parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }] },
    },
    "/pets/search": { post: { operationId: "searchPets" } },
    "/pets/{petId}/archive": { post: { operationId: "archivePet" } },
    "/charges": {
      post: {
        operationId: "createCharge",
        requestBody: {
          content: { "application/x-www-form-urlencoded": { schema: { type: "object", properties: { amount: { type: "integer" } } } } },
        },
      },
    },
  },
};

describe("guessKind", () => {
  it("reads the method first", () => {
    expect(guessKind("GET", "listPets", "/pets")).toBe("read");
    expect(guessKind("DELETE", "deletePet", "/pets/{petId}")).toBe("delete");
    expect(guessKind("PATCH", "updatePet", "/pets/{petId}")).toBe("edit");
    expect(guessKind("POST", "createPet", "/pets")).toBe("create");
  });
  it("catches POSTs that read or destroy", () => {
    expect(guessKind("POST", "searchPets", "/pets/search")).toBe("read");
    expect(guessKind("POST", "application.delete", "/application.delete")).toBe("delete");
    expect(guessKind("POST", "revokeToken", "/tokens/revoke")).toBe("delete");
    expect(guessKind("GET", "resetCache", "/cache/reset")).toBe("delete");
  });
  it("treats a POST on one item as an edit", () => {
    expect(guessKind("POST", "archivePet", "/pets/{petId}")).toBe("edit");
  });
  it("names every operation", () => {
    const kinds = guessKinds(petstore, "operationId");
    expect(Object.keys(kinds)).toHaveLength(8);
  });
});

describe("parseSpec", () => {
  it("reads JSON and YAML", () => {
    expect(parseSpec(JSON.stringify(petstore)).openapi).toBe("3.0.3");
    expect(parseSpec("openapi: 3.1.0\ninfo: {title: A, version: '1'}\npaths:\n  /a:\n    get: {}\n").openapi).toBe("3.1.0");
  });
  it("refuses what it can't import", () => {
    expect(() => parseSpec('{"swagger":"2.0","paths":{"/a":{}}}')).toThrow(/Swagger 2/);
    expect(() => parseSpec("<html>docs</html>")).toThrow(ImportError);
    expect(() => parseSpec('{"openapi":"3.0.0","paths":{}}')).toThrow(/no endpoints/);
  });
});

describe("isPrivateAddress", () => {
  it("blocks internal ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it("allows public ones", () => {
    for (const ip of ["8.8.8.8", "104.18.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("defaultBaseUrl", () => {
  it("takes the origin of an absolute server", () => {
    expect(defaultBaseUrl(petstore, "https://example.com/openapi.json")).toBe("https://api.example.com");
  });
  it("skips templated and relative-to-nothing servers", () => {
    expect(defaultBaseUrl({ servers: [{ url: "https://{region}.example.com" }] }, "https://x.test/s.json")).toBeNull();
  });
});

describe("imported endpoints run correctly", () => {
  const { endpoints } = convertOpenApi(petstore, { orgSlug: "demo", integrationSlug: "demo_app", kinds: guessKinds(petstore, "operationId") });
  const ep = (n: string) => endpoints.find((e) => e.name === n)!;

  it("records auth, query params and body encoding", () => {
    expect(ep("listPets").credentialScheme).toEqual({ type: "bearer" });
    expect(ep("createPet").queryParams).toEqual(["dry_run"]);
    expect(ep("createCharge").bodyEncoding).toBe("form");
    expect(ep("getPet").importWarnings.join(" ")).not.toMatch(/not substituted/);
  });

  it("fills path params", () => {
    const { url, body } = buildRequest("https://api.example.com", ep("getPet"), { petId: "a b" });
    expect(url.toString()).toBe("https://api.example.com/v1/pets/a%20b");
    expect(body).toBeUndefined();
  });

  it("splits query params from the JSON body on POST", () => {
    const { url, body, contentType } = buildRequest("https://api.example.com", ep("createPet"), { dry_run: true, name: "Rex" });
    expect(url.searchParams.get("dry_run")).toBe("true");
    expect(JSON.parse(body!)).toEqual({ name: "Rex" });
    expect(contentType).toBe("application/json");
  });

  it("form-encodes nested bodies", () => {
    const { body, contentType } = buildRequest("https://api.example.com", ep("createCharge"), {
      amount: 500,
      metadata: { order: "41" },
      items: ["a", "b"],
    });
    expect(contentType).toBe("application/x-www-form-urlencoded");
    expect(decodeURIComponent(body!)).toBe("amount=500&metadata[order]=41&items[0]=a&items[1]=b");
  });
});
