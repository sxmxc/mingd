import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBuildQueue, queueOperation } from "@/lib/queue";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "@/components/auto-refresh";
export default async function AdminMetricsPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const [stats, users, desktop, web] = await Promise.all([
    admin.rpc("admin_build_stats"), admin.auth.admin.listUsers({ page: 1, perPage: 1 }),
    queueOperation(getBuildQueue("linux").getJobCounts("wait", "active", "delayed", "failed")).catch(() => null),
    queueOperation(getBuildQueue("web").getJobCounts("wait", "active", "delayed", "failed")).catch(() => null),
  ]);
  if (stats.error) return <p role="alert">Could not load build metrics.</p>;
  const value = stats.data;
  const metrics = [["Total builds", value.builds], ["Active", value.active], ["Completed", value.complete], ["Failed", value.failed], ["Artifact cache hits", value.cached], ["Stored artifacts", value.artifacts], ["Artifact storage", `${(value.artifact_bytes / 1048576).toFixed(1)} MiB`], ["Average successful build", value.average_build_seconds == null ? "No measurements" : `${(value.average_build_seconds / 60).toFixed(1)} min`], ["Users", users.error ? "Unavailable" : users.data.total || (users.data.users.length ? "At least 1" : 0)]];
  return <section><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Metrics</h2><AutoRefresh /></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(([label, number]) => <Card key={label} className="p-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-3 font-mono text-2xl">{number}</p></Card>)}</div><h3 className="mb-4 mt-8 text-lg font-semibold">Queues</h3><div className="grid gap-4 sm:grid-cols-2">{[["Desktop", desktop], ["Web", web]].map(([label, counts]) => <Card key={String(label)} className="p-5"><h4>{String(label)}</h4><p className="mt-3 font-mono text-sm text-[var(--muted)]">{counts && typeof counts === "object" ? Object.entries(counts).map(([key, number]) => `${key}: ${number}`).join(" · ") : "Queue unavailable"}</p></Card>)}</div><p className="mt-5 text-xs text-[var(--muted)]">Build totals cover all records. Duration excludes artifact cache hits. Queue counts reflect Redis; retained failed jobs include previous attempts.</p></section>;
}
