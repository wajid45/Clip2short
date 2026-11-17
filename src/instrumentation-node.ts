import { runPublisher } from "./lib/social/publisher";

export async function startScheduler() {
  if (process.env.INTERNAL_SCHEDULER !== "true") return;
  const g = globalThis as unknown as { __shortlarkSchedulerArmed?: boolean };
  if (g.__shortlarkSchedulerArmed) return;
  g.__shortlarkSchedulerArmed = true;

  
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runPublisher();
      if (r.published || r.failed) console.log(`[scheduler] published=${r.published} failed=${r.failed} stats=${r.checked}`);
    } catch (e) {
      console.error("[scheduler] tick failed", e);
    } finally {
      running = false;
    }
  };
  // Align to the quarter hour so "every 15 minutes" matches what users see in the queue.
  const msToQuarter = 15 * 60e3 - (Date.now() % (15 * 60e3));
  setTimeout(() => {
    void tick();
    setInterval(tick, 15 * 60e3);
  }, msToQuarter);
  console.log(`[scheduler] internal publisher armed; first run in ${Math.round(msToQuarter / 1000)}s`);
}
