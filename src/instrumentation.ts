/**
 * Optional in-process scheduler for hosts without an external cron
 * (a single long-running Node server, e.g. Docker/VPS). Enable with INTERNAL_SCHEDULER=true.
 * On Vercel, vercel.json triggers /api/cron/publish every 15 minutes instead.
 */
export async function register() {
  // Literal check so the bundler drops the Node-only module from the edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./instrumentation-node");
    await startScheduler();
  }
}
