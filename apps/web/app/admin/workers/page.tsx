import Link from "next/link";
import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "@/components/auto-refresh";
import { WorkerFleet } from "@/components/worker-fleet";
import { WorkerStatsSchema } from "@/lib/worker-health";

export default async function WorkersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requireSuperAdmin();
  const requested = (await searchParams).page;
  const page = typeof requested === "string" && /^[1-9]\d{0,4}$/.test(requested) ? Math.min(Number(requested), 40001) : 1;
  const { data, error } = await createAdminClient().rpc("admin_worker_stats", { p_limit: 25, p_offset: (page - 1) * 25 });
  const stats = WorkerStatsSchema.safeParse(data);
  if (error || !stats.success) return <p role="alert">Worker statistics unavailable. Check the gateway and database migrations.</p>;
  const now = Date.now();
  const pages = Math.max(1, Math.ceil(stats.data.total / 25));
  return <section aria-labelledby="workers-heading">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="workers-heading" className="text-xl font-semibold">Workers</h2><p className="mt-1 text-xs text-[var(--muted)]">{stats.data.total} enrolled workers · Health and build activity</p></div><AutoRefresh /></div>
    <WorkerFleet workers={stats.data.workers} now={now} paginated={pages > 1} />
    <nav aria-label="Worker pages" className="mt-5 flex gap-4 text-sm">{page > 1 && <Link href={`/admin/workers?page=${page - 1}`}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={`/admin/workers?page=${page + 1}`}>Next</Link>}</nav>
    <details className="mt-5 text-xs leading-5 text-[var(--muted)]"><summary>How worker measurements work</summary><p className="mt-2">Health uses authenticated gateway receipts. Telemetry is sampled every 30 seconds. Cache totals belong to each worker’s local cache volume and may reset; workers sharing a volume report the same totals. CPU and memory describe the container’s cgroup v2, including child processes and memory charged to that group, rather than the whole host. CPU needs two samples. Per-build RSS is the largest measured child process. Offline means no receipt for 90 seconds; revoked and draining are operator states.</p></details>
  </section>;
}
