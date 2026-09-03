import { NextResponse, type NextRequest } from "next/server";
import { runDueJobs, registeredJobTypes } from "@/lib/services/jobs";
import { config } from "@/lib/config";

// Importing these registers their handlers with the runner.
import "@/lib/services/extraction";
import "@/lib/services/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains the persisted job queue. `npm run worker` does this in a loop on a
 * normal server; a serverless host has no long-running process, so the same
 * runner is exposed as a route for a scheduled invocation to call.
 *
 * Nothing on the critical path depends on it: extraction runs inline on submit
 * and payment callbacks resolve in the action that starts them. This is the
 * safety net that retries what failed and surfaces the dead-letter count.
 *
 * Vercel signs its scheduler's requests with CRON_SECRET. When that is set we
 * require it, so the endpoint cannot be used by anyone else to burn compute.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (!config.SHOW_DEMO_BANNER) {
    // No secret configured and not a demo deployment — refuse rather than
    // leave an unauthenticated worker trigger exposed.
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const started = Date.now();
  let ran = 0;
  try {
    // Bounded: the route has a wall clock, and unfinished work stays queued.
    while (Date.now() - started < 45_000) {
      const batch = await runDueJobs(10);
      ran += batch;
      if (batch === 0) break;
    }
  } catch (err) {
    return NextResponse.json(
      { ran, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ran,
    handlers: registeredJobTypes(),
    elapsedMs: Date.now() - started,
  });
}
