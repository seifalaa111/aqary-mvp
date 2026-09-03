/**
 * The background job runner. Extraction runs inline on submit and payment
 * callbacks are resolved by the action that starts them, so the product works
 * without this process. Run it to drain the queue continuously instead.
 *
 *   npm run worker
 */
import { runDueJobs, registeredJobTypes } from "../src/lib/services/jobs.js";

// Importing these registers their handlers with the runner.
import "../src/lib/services/extraction.js";
import "../src/lib/services/payments.js";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 2000);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log("\nStopping after the current batch…");
    stopping = true;
  });
}

console.log(`Aqary worker started. Handlers: ${registeredJobTypes().join(", ")}`);

while (!stopping) {
  try {
    const ran = await runDueJobs(10);
    if (ran > 0) console.log(`ran ${ran} job(s)`);
  } catch (err) {
    console.error("worker error:", err instanceof Error ? err.message : err);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}

console.log("Worker stopped.");
process.exit(0);
