// Runs once when a server starts. The Node-only work lives in
// instrumentation-node.ts so the Edge build never sees Node modules.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./instrumentation-node");
    await runMigrations();
    const { syncOfficialCatalogOnStartup } = await import("./lib/official-catalog");
    await syncOfficialCatalogOnStartup();
    const { backfillKeyHints } = await import("./lib/key-hint-backfill");
    await backfillKeyHints().catch((err) => console.error("[zeqqat] key hint backfill failed:", err));
    const { startTelemetry } = await import("./lib/telemetry");
    await startTelemetry();
  }
}
