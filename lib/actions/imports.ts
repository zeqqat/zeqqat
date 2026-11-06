"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "../guard";
import { ImportError, importFromUrl } from "../spec-import";

export type ImportState = { error?: string; values?: { specUrl: string; docsUrl: string; name: string } };

// The dashboard's "Add an app" form. Same import as the zeqqat_import MCP
// tool and POST /api/integrations/import, under the current workspace's
// account.
export async function importAppAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { ws } = await requireOwner();
  const values = {
    specUrl: (formData.get("spec_url")?.toString() ?? "").trim(),
    docsUrl: (formData.get("docs_url")?.toString() ?? "").trim(),
    name: (formData.get("name")?.toString() ?? "").trim(),
  };
  if (!values.specUrl) return { error: "Paste a link to the app's OpenAPI spec.", values };

  let slug: string;
  let tools: number;
  let updated: boolean;
  try {
    const r = await importFromUrl({
      organizationId: ws.organizationId,
      orgSlug: ws.organizationSlug,
      specUrl: values.specUrl,
      docsUrl: values.docsUrl || null,
      name: values.name || null,
    });
    slug = r.slug;
    tools = r.endpoints;
    updated = r.updated;
  } catch (err) {
    if (err instanceof ImportError) return { error: err.message, values };
    console.error("[zeqqat] import failed:", err);
    return { error: "The import failed. Check the link and try again.", values };
  }

  revalidatePath("/app", "layout");
  redirect(`/app/integrations?imported=${encodeURIComponent(slug)}&tools=${tools}${updated ? "&updated=1" : ""}`);
}
