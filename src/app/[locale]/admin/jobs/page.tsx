import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth/guard";
import { Eyebrow } from "@/components/ui/primitives";
import { sanitizeJobPayload } from "@/lib/services/jobs";
import { JobsManager, type JobRowItem } from "@/components/admin/jobs-manager";
import type { JobStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRolePage("ADMIN");

  const [jobs, groupedCounts] = await Promise.all([
    prisma.job.findMany({
      take: 60,
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const rows: JobRowItem[] = jobs.map((j) => {
    let durationMs: number | null = null;
    if (j.startedAt && j.finishedAt) {
      durationMs = j.finishedAt.getTime() - j.startedAt.getTime();
    }

    return {
      id: j.id,
      type: j.type,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      runAt: j.runAt.toISOString(),
      startedAt: j.startedAt ? j.startedAt.toISOString() : null,
      completedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
      durationMs,
      lastError: j.lastError,
      payload: sanitizeJobPayload(j.payload),
      createdAt: j.createdAt.toISOString(),
    };
  });

  const counts = groupedCounts.map((g) => ({
    status: g.status as JobStatus,
    count: g._count,
  }));

  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>{isAr ? "البنية التحتية والمحركات" : "System Workers"}</Eyebrow>
        <h1 className="mt-1 display-section text-ink">
          {isAr ? "مراقب المهام الخلفية وقوائم الانتظار" : "Background Jobs & Worker Queue"}
        </h1>
        <p className="mt-1 text-sm text-ink-50">
          {isAr
            ? "متابعة المهام غير المتزامنة، فحص الأخطاء، وحجب البيانات الحساسة مع إمكانية إعادة التشغيل الآمن."
            : "Monitor asynchronous tasks, inspect sanitized execution payloads, and trigger safe idempotent retries."}
        </p>
      </header>

      <JobsManager locale={locale} jobs={rows} counts={counts} />
    </div>
  );
}
