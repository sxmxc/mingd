import Link from "next/link";
import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card } from "@/components/ui/card";
import { cacheHitRate, readingAge, workerBuildMetrics, workerHealth, WorkerStatsSchema, workerTelemetry } from "@/lib/worker-health";

const bytes = (value: number) => value >= 1073741824 ? `${(value / 1073741824).toFixed(2)} GiB` : `${(value / 1048576).toFixed(1)} MiB`;
const elapsed = (seconds: number) => seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} h` : seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds)} s`;
const time = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" });
function Values({ values }: { values: [string, string | number][] }) {
  return <dl className="grid gap-4 sm:grid-cols-3">{values.map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-mono text-sm tabular-nums">{value}</dd></div>)}</dl>;
}

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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="workers-heading" className="text-xl font-semibold">Workers</h2><p className="mt-1 text-xs text-[var(--muted)]">{stats.data.total} enrolled workers. Health uses authenticated gateway receipts; telemetry is sampled every 30 seconds.</p></div><AutoRefresh /></div>
    <div className="space-y-4">{stats.data.workers.map(worker => {
      const health = workerHealth(worker, now);
      const telemetry = workerTelemetry(worker.telemetry);
      const age = readingAge(worker.telemetryAt, now);
      const fresh = age !== null && age <= 90_000;
      const metrics = workerBuildMetrics(worker.latestBuild?.metrics);
      return <Card key={worker.id} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4"><div><h3 className="font-semibold">{worker.name}</h3><p className="mt-1 text-xs text-[var(--muted)]">{worker.target} · app {worker.release} · recipe {worker.recipeVersion} · {worker.activeBuilds.length}/{worker.capacity} active slots</p></div><span className={`queue-indicator ${health === "Online" ? "available" : "unavailable"}`}>{health}</span></div>
        <div className="space-y-5 p-4">
          <p className="text-xs text-[var(--muted)]">Last seen: {worker.lastSeenAt && readingAge(worker.lastSeenAt, now) !== null ? time(worker.lastSeenAt) : "Never"}. Telemetry: {age === null ? "Not reported" : `${fresh ? "Updated" : "Stale reading from"} ${elapsed(age / 1000)} ago`}.</p>
          <div><h4 className="mb-3 text-sm font-medium">Compiler cache · cumulative totals</h4>{telemetry?.ccache ? <Values values={[
            ["Hits / misses", `${telemetry.ccache.hits.toLocaleString()} / ${telemetry.ccache.misses.toLocaleString()}`],
            ["Hit rate", cacheHitRate(telemetry.ccache.hits, telemetry.ccache.misses)],
            ["Stored / configured maximum", `${bytes(telemetry.ccache.sizeBytes)} / ${telemetry.ccache.maxSize}`],
            ["Cached files", telemetry.ccache.files.toLocaleString()], ["Version", telemetry.ccache.version],
            ["Counters reset", telemetry.ccache.counters.stats_zeroed_timestamp ? time(String(new Date(telemetry.ccache.counters.stats_zeroed_timestamp * 1000))) : "Not recorded"],
          ]} /> : <p className="text-sm text-[var(--muted)]">Cache statistics unavailable.</p>}</div>
          <div><h4 className="mb-3 text-sm font-medium">Container resources</h4>{telemetry?.container ? <Values values={[
            ["CPU cores in use", telemetry.container.cpuCoresUsed === null ? "Waiting for next sample" : telemetry.container.cpuCoresUsed.toFixed(2)],
            ["CPU quota", telemetry.container.cpuLimitCores === null ? "No quota" : `${telemetry.container.cpuLimitCores.toFixed(2)} cores`],
            ["Memory usage / limit", `${bytes(telemetry.container.memoryBytes)} / ${telemetry.container.memoryLimitBytes === null ? "No limit" : bytes(telemetry.container.memoryLimitBytes)}`],
            ["Processes / threads", telemetry.container.pids], ["Worker uptime", elapsed(telemetry.uptimeSeconds)],
          ]} /> : <p className="text-sm text-[var(--muted)]">Container measurements unavailable.</p>}</div>
          <div><h4 className="mb-2 text-sm font-medium">Active builds</h4>{worker.activeBuilds.length ? <ul className="space-y-2 text-sm">{worker.activeBuilds.map(build => <li key={build.id}><Link className="text-[var(--accent)] underline" href={`/build/${build.id}`}>{build.id.slice(0, 8)}</Link> · {build.stage?.replaceAll("_", " ") ?? build.status} · {build.progress ?? 0}%</li>)}</ul> : <p className="text-sm text-[var(--muted)]">No active assignments.</p>}</div>
          {worker.latestBuild && <details className="border-t border-[var(--border)] pt-3"><summary className="text-sm font-medium">Latest build diagnostics · {worker.latestBuild.status}</summary><div className="mt-3 space-y-3"><Link className="text-sm text-[var(--accent)] underline" href={`/build/${worker.latestBuild.id}`}>Open build {worker.latestBuild.id.slice(0, 8)}</Link>{metrics ? <><Values values={[
            ["Recorded elapsed time", elapsed(metrics.elapsedMs / 1000)],
            ["Peak child process RSS", metrics.peakRssKiB === null ? "Not measured" : bytes(metrics.peakRssKiB * 1024)],
            ["Build cache hits / misses", metrics.cache ? `${metrics.cache.hits} / ${metrics.cache.misses}` : "Unavailable"],
            ["Cache usage verified", metrics.cache ? metrics.cache.usageVerified ? "Yes" : "No" : "Unavailable"],
          ]} /><dl className="flex flex-wrap gap-4 text-xs">{Object.entries(metrics.stageDurationsMs).map(([stage, ms]) => <div key={stage}><dt className="text-[var(--muted)]">{stage.replaceAll("_", " ")}</dt><dd>{elapsed(ms / 1000)}</dd></div>)}</dl></> : <p className="text-sm text-[var(--muted)]">Build diagnostics not recorded yet.</p>}</div></details>}
        </div>
      </Card>;
    })}</div>
    {!stats.data.workers.length && <p className="py-6 text-sm text-[var(--muted)]">No workers on this page. Enroll workers with the operator CLI.</p>}
    <nav aria-label="Worker pages" className="mt-5 flex gap-4 text-sm">{page > 1 && <Link href={`/admin/workers?page=${page - 1}`}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={`/admin/workers?page=${page + 1}`}>Next</Link>}</nav>
    <p className="mt-5 text-xs leading-5 text-[var(--muted)]">Cache totals belong to each worker’s local cache volume and may reset; workers sharing a volume report the same totals. CPU and memory describe the container’s cgroup v2, including child processes and memory charged to that group, rather than the whole host. CPU needs two samples. Per-build RSS is the largest measured child process. Offline means no receipt for 90 seconds; revoked and draining are operator states.</p>
  </section>;
}
