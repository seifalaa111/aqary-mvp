import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Persisted job queue with an in-process runner: retry, exponential backoff,
 * dead-lettering, and per-job status visible in the ops console. Deliberately
 * not Redis/BullMQ — see §1.4 of the brief. Swapping in a real queue later
 * means replacing `runDueJobs`, not the handlers.
 */

export type JobHandler = (payload: Record<string, unknown>, jobId: string) => Promise<unknown>;

const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export function registeredJobTypes(): string[] {
  return [...handlers.keys()];
}

export async function enqueue(
  type: string,
  payload: Prisma.InputJsonValue,
  opts: { runAt?: Date; maxAttempts?: number } = {},
) {
  return prisma.job.create({
    data: {
      type,
      payload,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
    },
  });
}

const BACKOFF_MS = [2_000, 15_000, 60_000];

/** Claims and runs due jobs. Safe to call repeatedly; returns how many ran. */
export async function runDueJobs(limit = 5): Promise<number> {
  let ran = 0;

  for (let i = 0; i < limit; i++) {
    const claimed = await claimNext();
    if (!claimed) break;

    const handler = handlers.get(claimed.type);
    if (!handler) {
      await prisma.job.update({
        where: { id: claimed.id },
        data: {
          status: "DEAD",
          finishedAt: new Date(),
          lastError: `No handler registered for job type "${claimed.type}"`,
        },
      });
      continue;
    }

    try {
      const result = await handler((claimed.payload ?? {}) as Record<string, unknown>, claimed.id);
      await prisma.job.update({
        where: { id: claimed.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          result: (result ?? null) as Prisma.InputJsonValue,
          lastError: null,
        },
      });
    } catch (err) {
      const attempts = claimed.attempts;
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = attempts >= claimed.maxAttempts;
      await prisma.job.update({
        where: { id: claimed.id },
        data: exhausted
          ? { status: "DEAD", finishedAt: new Date(), lastError: message }
          : {
              status: "QUEUED",
              lastError: message,
              runAt: new Date(Date.now() + (BACKOFF_MS[attempts - 1] ?? 60_000)),
            },
      });
    }
    ran++;
  }

  return ran;
}

async function claimNext() {
  // Optimistic claim: pick one QUEUED row that is due, then take it with a
  // conditional update so two runners cannot both get it.
  const candidate = await prisma.job.findFirst({
    where: { status: "QUEUED", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
  });
  if (!candidate) return null;

  const claim = await prisma.job.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count === 0) return null;

  return prisma.job.findUniqueOrThrow({ where: { id: candidate.id } });
}

/** Runs a specific job inline and waits for it — used by request paths that
 *  need the result immediately (the seller pressing "Submit"). */
export async function runJobNow(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "QUEUED") return;
  const handler = handlers.get(job.type);
  if (!handler) return;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });
  try {
    const result = await handler((job.payload ?? {}) as Record<string, unknown>, jobId);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "SUCCEEDED", finishedAt: new Date(), result: (result ?? null) as Prisma.InputJsonValue },
    });
  } catch (err) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: job.attempts + 1 >= job.maxAttempts ? "DEAD" : "QUEUED",
        lastError: err instanceof Error ? err.message : String(err),
        runAt: new Date(Date.now() + 2000),
      },
    });
  }
}

export class JobError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "JobError";
  }
}

export function sanitizeJobPayload(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") return data;
  if (Array.isArray(data)) return data.map(sanitizeJobPayload);
  if (typeof data === "object") {
    const sensitive = /password|token|secret|authorization|creditcard|nationalid|cvv/i;
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (sensitive.test(k)) {
        sanitized[k] = "[REDACTED]";
      } else {
        sanitized[k] = sanitizeJobPayload(v);
      }
    }
    return sanitized;
  }
  return data;
}

export async function retryJob(args: { jobId: string; actorId: string; actorRole: Role }) {
  if (args.actorRole !== "ADMIN") {
    throw new JobError("Only admin can retry background jobs", "FORBIDDEN_ROLE");
  }
  const job = await prisma.job.findUniqueOrThrow({ where: { id: args.jobId } });
  if (job.status !== "FAILED" && job.status !== "DEAD") {
    throw new JobError("Only failed or dead jobs can be retried", "NOT_RETRYABLE");
  }

  await prisma.job.update({
    where: { id: args.jobId },
    data: {
      status: "QUEUED",
      runAt: new Date(),
      lastError: null,
      attempts: Math.max(0, job.attempts - 1),
    },
  });

  await audit({
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: "JOB_RETRIED",
    entityType: "Job",
    entityId: job.id,
    before: { status: job.status, attempts: job.attempts, lastError: job.lastError },
    after: { status: "QUEUED" },
    metadata: { jobType: job.type },
  });

  await runJobNow(args.jobId);
  return prisma.job.findUniqueOrThrow({ where: { id: args.jobId } });
}
