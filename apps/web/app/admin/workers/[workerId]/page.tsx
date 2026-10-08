import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkerDetails, WorkerIdSchema } from "@/lib/worker-details";
import { AutoRefresh } from "@/components/auto-refresh";
import { WorkerDetails } from "@/components/worker-fleet";

export default async function WorkerPage({ params }: { params: Promise<{ workerId: string }> }) {
  await requireSuperAdmin();
  const { workerId } = await params;
  if (!WorkerIdSchema.safeParse(workerId).success) notFound();
  const now = Date.now();
  const worker = await loadWorkerDetails(createAdminClient(), workerId, now);
  if (!worker) notFound();

  return <section aria-labelledby="worker-heading">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link href="/admin/workers" className="text-sm text-[var(--accent-strong)] hover:underline">← All workers</Link>
      <AutoRefresh />
    </div>
    <WorkerDetails worker={worker} now={now} />
  </section>;
}
