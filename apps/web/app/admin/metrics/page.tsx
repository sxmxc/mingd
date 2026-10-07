import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBuildQueue, queueOperation } from "@/lib/queue";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "@/components/auto-refresh";

type QueueCounts = { wait: number; active: number; delayed: number; failed: number };

function normalizeQueueCounts(counts: Record<string, number> | null): QueueCounts | null {
  if (!counts || !["wait", "active", "delayed", "failed"].every(key => Number.isFinite(counts[key]))) return null;
  return { wait: counts.wait, active: counts.active, delayed: counts.delayed, failed: counts.failed };
}

export default async function AdminMetricsPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const [stats, users, linux, web, android, macos, daily, maintenance, releases] = await Promise.all([
    admin.rpc("admin_build_stats"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1 }),
    queueOperation(getBuildQueue("linux").getJobCounts("wait", "active", "delayed", "failed")).catch(() => null),
    queueOperation(getBuildQueue("web").getJobCounts("wait", "active", "delayed", "failed")).catch(() => null),
    queueOperation(getBuildQueue("android").getJobCounts("wait", "active", "delayed", "failed")).catch(() => null),
    queueOperation(getBuildQueue("macos").getJobCounts("wait", "active", "delayed", "failed")).catch(() => null),
    admin.from("build_statistics_daily").select("*").order("day", { ascending: false }).limit(14),
    admin.from("maintenance_tasks").select("name,requested,lease_until,completed_at,last_error,result").order("name"),
    admin.from("official_release_catalog").select("versions,refreshed_at").eq("id", true).maybeSingle(),
  ]);
  if (stats.error) return <p role="alert" className="text-[var(--danger)]">Could not load build metrics.</p>;

  const value = stats.data;
  const queues: { label: string; counts: QueueCounts | null }[] = [
    { label: "Linux / Windows", counts: normalizeQueueCounts(linux) },
    { label: "Web", counts: normalizeQueueCounts(web) },
    { label: "Android", counts: normalizeQueueCounts(android) },
    { label: "macOS", counts: normalizeQueueCounts(macos) },
  ];
  const queueDepth = queues.every(queue => queue.counts !== null)
    ? queues.reduce((total, queue) => total + (queue.counts?.wait ?? 0), 0)
    : null;
  const cacheRate = value.complete > 0 ? `${(value.cached / value.complete * 100).toFixed(1)}% of completed builds` : "No completed builds";
  const primaryMetrics = [
    { label: "Active builds", value: value.active, detail: "nonterminal build records" },
    { label: "Waiting jobs", value: queueDepth ?? "Unavailable", detail: "across all four queues" },
    { label: "Failed records", value: value.failed, detail: "all-time build records" },
    { label: "Avg. successful build", value: value.average_build_seconds == null ? "—" : `${(value.average_build_seconds / 60).toFixed(1)} min`, detail: "excludes artifact-cache hits" },
    { label: "Cache-hit requests", value: value.cached, detail: cacheRate },
  ];
  const secondaryMetrics = [
    ["Total build records", value.builds],
    ["Completed records", value.complete],
    ["Stored artifacts", value.artifacts],
    ["Artifact storage", `${(value.artifact_bytes / 1048576).toFixed(1)} MiB`],
    ["Users", users.error ? "Unavailable" : users.data.total || (users.data.users.length ? "At least 1" : 0)],
  ] as const;
  const queueStatus = queues.every(queue => queue.counts !== null) ? "All queue counts available" : `${queues.filter(queue => queue.counts !== null).length} of 4 queue counts available`;

  return <section aria-labelledby="metrics-heading">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="metrics-heading" className="text-xl font-semibold">Operational metrics</h2><p className="mt-1 text-xs text-[var(--muted)]">Build-record totals are all-time; queue counts are current Redis state.</p></div>
      <AutoRefresh />
    </div>
    <div className="admin-metric-grid mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {primaryMetrics.map(metric => <Card key={metric.label} className="p-4">
        <p className="text-xs text-[var(--muted)]">{metric.label}</p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{metric.value}</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{metric.detail}</p>
      </Card>)}
    </div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-base font-semibold">Build queues</h3><p className="mt-1 text-xs text-[var(--muted)]">Current Redis counts; worker health is not exposed by this metrics source.</p></div>
      <span className="text-xs text-[var(--muted)]">{queueStatus}</span>
    </div>
    <div className="admin-queue-grid grid gap-3 sm:grid-cols-2">
      {queues.map(queue => <Card key={queue.label} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h4 className="text-sm font-medium">{queue.label}</h4>
          <span className={`queue-indicator ${queue.counts ? "available" : "unavailable"}`}>{queue.counts ? "Connected" : "Unavailable"}</span>
        </div>
        {queue.counts ? <dl className="grid grid-cols-4 divide-x divide-[var(--border)]">
          {([["Wait", queue.counts.wait], ["Active", queue.counts.active], ["Delayed", queue.counts.delayed], ["Failed jobs", queue.counts.failed]] as const).map(([label, count]) => <div key={label} className="min-w-0 px-3 py-3 text-center">
            <dt className="truncate text-[10px] text-[var(--muted)]">{label}</dt><dd className="mt-1 font-mono text-sm tabular-nums">{count}</dd>
          </div>)}
        </dl> : <p role="status" className="px-4 py-5 text-xs text-[var(--muted)]">Queue counts could not be retrieved.</p>}
      </Card>)}
    </div>
    <details className="mt-4 rounded-md border border-[var(--border)] bg-[var(--panel)]">
      <summary className="px-4 py-3 text-sm font-medium">Build totals, storage & account data</summary>
      <dl className="admin-secondary-grid grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2 lg:grid-cols-5">
        {secondaryMetrics.map(([label, number]) => <div key={label} className="min-w-0">
          <dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-mono text-sm tabular-nums">{number}</dd>
        </div>)}
      </dl>
    </details>
    <div className="mt-6">
      <h3 className="text-base font-semibold">Daily build results</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">Grouped by completion date in UTC. Success rate excludes active builds; compile averages use recorded compile-stage time.</p>
      {daily.error ? <p role="alert">Daily statistics unavailable. Apply the maintenance migration.</p> : <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]"><table className="admin-table"><thead><tr><th>Day (UTC)</th><th>Complete / failed</th><th>Success rate</th><th>Cache hits</th><th>Avg. build / compile</th><th>Storage snapshot</th></tr></thead><tbody>{(daily.data ?? []).map(row => <tr key={row.day}>
        <td>{row.day}</td><td>{row.complete} / {row.failed}</td><td>{row.builds ? `${(row.complete / row.builds * 100).toFixed(1)}%` : "—"}</td><td>{row.cached}</td>
        <td>{row.average_build_seconds == null ? "—" : `${(Number(row.average_build_seconds) / 60).toFixed(1)} min`} / {row.average_compile_seconds == null ? "—" : `${(Number(row.average_compile_seconds) / 60).toFixed(1)} min`}</td>
        <td>{(row.artifact_bytes / 1048576).toFixed(1)} MiB · {row.artifacts} artifacts</td>
      </tr>)}</tbody></table>{!daily.data?.length && <p className="p-4 text-sm">No daily snapshots yet.</p>}</div>}
    </div>
    <div className="mt-6">
      <h3 className="text-base font-semibold">Scheduled maintenance</h3>
      {maintenance.error ? <p role="alert">Maintenance status unavailable.</p> : <ul className="mt-3 space-y-3 text-sm">{(maintenance.data ?? []).map(task => <li key={task.name}>
        <span className="font-medium">{task.name === "artifact_cleanup" ? "Orphaned artifact cleanup" : "Official release refresh"}</span>: {task.last_error ? "Retry pending" : task.lease_until ? "Running" : task.requested ? "Pending" : "Idle"}
        <p className="text-xs text-[var(--muted)]">Last completed: {task.completed_at ? new Date(task.completed_at).toISOString() : "Never"}</p>
        {task.last_error && <p className="text-xs text-[var(--danger)]">{task.last_error}</p>}
      </li>)}</ul>}
      <p className="mt-3 text-xs text-[var(--muted)]">{releases.error ? "Release catalog status unavailable." : releases.data ? `Catalog contains ${releases.data.versions.length} verified releases; refreshed ${new Date(releases.data.refreshed_at).toISOString()}.` : "Waiting for the first official release refresh."}</p>
    </div>
    <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Queue counts reflect Redis; retained failed queue jobs can include previous attempts and are distinct from failed build records. Average successful build duration excludes requests served from the artifact cache.</p>
  </section>;
}
