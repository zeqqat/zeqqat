import { describe, expect, it, vi } from "vitest";
import { MAX_CONNECTOR_NAME_LENGTH, claudeConnectorName, claudeInstallLink } from "../../lib/agents";
import { TOOL_NAMES } from "../../lib/mcp-tools";

vi.mock("../../db", () => ({ db: {} }));

describe("claudeConnectorName", () => {
  it("shows the connection, then the owner", () => {
    expect(claudeConnectorName("https://zeqqat.com/gaita/mcp/deployment/a39f")).toBe("Zeqqat | deployment (@gaita)");
  });

  it("drops the owner when the full name is too long", () => {
    const name = claudeConnectorName("https://zeqqat.com/a_very_long_company_name/mcp/deployment/a39f");
    expect(name).toBe("Zeqqat | deployment");
  });

  it("falls back to Zeqqat when even the connection is too long", () => {
    const url = "https://zeqqat.com/gaita/mcp/an_extremely_long_connection_name_here/a39f";
    expect(claudeConnectorName(url)).toBe("Zeqqat");
  });

  it("falls back to Zeqqat for anything that isn't a connection URL", () => {
    expect(claudeConnectorName("not a url")).toBe("Zeqqat");
    expect(claudeConnectorName("https://zeqqat.com/app")).toBe("Zeqqat");
  });

  it("never pushes a built-in tool past Claude's 64 character limit", () => {
    const longest = Math.max(...Object.values(TOOL_NAMES).map((t) => t.length));
    expect(5 + MAX_CONNECTOR_NAME_LENGTH + 2 + longest).toBeLessThanOrEqual(64);
  });

  it("puts the name in the install link", () => {
    const link = claudeInstallLink("https://zeqqat.com/gaita/mcp/deployment/a39f");
    expect(new URL(link).searchParams.get("connectorName")).toBe("Zeqqat | deployment (@gaita)");
  });
});
