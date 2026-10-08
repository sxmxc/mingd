import Link from "next/link";
import { ChevronDown, Server } from "lucide-react";
import type { z } from "zod";
import { PlatformIcon } from "@/components/platform-target";
import { cacheHitRate, readingAge, workerBuildMetrics, workerHealth, WorkerStatsSchema, workerTelemetry } from "@/lib/worker-health";
import styles from "./worker-fleet.module.css";

type Worker = z.infer<typeof WorkerStatsSchema>["workers"][number];
const bytes = (value: number) => value >= 1073741824 ? `${(value / 1073741824).toFixed(2)} GiB` : `${(value / 1048576).toFixed(1)} MiB`;
const elapsed = (seconds: number) => seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} h` : seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds)} s`;
const time = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" });

function Values({ values }: { values: [string, string | number][] }) {
  return <dl className={styles.values}>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function WorkerRow({ worker, now }: { worker: Worker; now: number }) {
  const health = workerHealth(worker, now);
  const telemetry = workerTelemetry(worker.telemetry);
  const age = readingAge(worker.telemetryAt, now);
  const lastSeen = readingAge(worker.lastSeenAt, now);
  const fresh = age !== null && age <= 90_000;
  const metrics = workerBuildMetrics(worker.latestBuild?.metrics);
  const container = telemetry?.container;
  const cache = telemetry?.ccache;
  const telemetryLabel = age === null ? "Telemetry not reported" : `${fresh ? "Sampled" : "Stale sample ·"} ${elapsed(age / 1000)} ago`;
  return <article className={styles.worker} aria-label={worker.name}>
    <div className={styles.row}>
      <div className={styles.identity}>
        <span className={styles.icon}><PlatformIcon platform={worker.target} /></span>
        <div>
          <div className={styles.nameLine}><h3>{worker.name}</h3><span className={styles.badge} data-health={health}>{health}</span></div>
          <p title={worker.lastSeenAt && lastSeen !== null ? time(worker.lastSeenAt) : undefined}>{worker.target} · {lastSeen === null ? "Never seen" : `Seen ${elapsed(lastSeen / 1000)} ago`}</p>
        </div>
      </div>
      <div className={styles.metric}><span>Build slots</span><strong>{worker.activeBuilds.length} <small>/ {worker.capacity}</small></strong></div>
      <div className={styles.metric}><span>CPU usage</span><strong>{container?.cpuCoresUsed == null ? <span title={container ? "Waiting for next sample" : "Not reported"}>—</span> : container.cpuCoresUsed.toFixed(2)} <small>{container?.cpuCoresUsed == null ? "" : "cores"}</small></strong></div>
      <div className={styles.metric}><span>Memory</span><strong>{container ? bytes(container.memoryBytes) : <span title="Not reported">—</span>}</strong></div>
      <div className={styles.metric}><span>Cache hit rate</span><strong>{cache ? cacheHitRate(cache.hits, cache.misses) : <span title="Not reported">—</span>}</strong></div>
    </div>
    <div className={styles.activity}>
      {worker.activeBuilds.length ? <ul>{worker.activeBuilds.map(build => <li key={build.id}>
        <Link href={`/build/${build.id}`}>Build {build.id.slice(0, 8)}</Link><span>{build.stage?.replaceAll("_", " ") ?? build.status}</span><strong>{build.progress === null ? "Progress unavailable" : `${build.progress}%`}</strong>
      </li>)}</ul> : <span>No active builds</span>}
      <span className={styles.sample} data-stale={age !== null && !fresh}>{telemetryLabel}</span>
    </div>
    <details className={styles.details}>
      <summary><span>Worker details</span><ChevronDown size={14} aria-hidden="true" /></summary>
      <div className={styles.detailContent}>
        <p className={styles.timestamps}>App v{worker.release} · recipe {worker.recipeVersion}. Last seen: {worker.lastSeenAt && lastSeen !== null ? time(worker.lastSeenAt) : "Never"}. Telemetry: {telemetryLabel}.</p>
        <div className={styles.detailGrid}>
          <section><h4>Compiler cache <span>Cumulative totals</span></h4>{cache ? <Values values={[
            ["Hits / misses", `${cache.hits.toLocaleString()} / ${cache.misses.toLocaleString()}`],
            ["Hit rate", cacheHitRate(cache.hits, cache.misses)],
            ["Stored / maximum", `${bytes(cache.sizeBytes)} / ${cache.maxSize}`],
            ["Cached files", cache.files.toLocaleString()], ["Version", cache.version],
            ["Counters reset", cache.counters.stats_zeroed_timestamp ? time(new Date(cache.counters.stats_zeroed_timestamp * 1000).toISOString()) : "Not recorded"],
          ]} /> : <p>Cache statistics unavailable.</p>}</section>
          <section><h4>Container resources</h4>{container ? <Values values={[
            ["CPU cores in use", container.cpuCoresUsed === null ? "Waiting for next sample" : container.cpuCoresUsed.toFixed(2)],
            ["CPU quota", container.cpuLimitCores === null ? "No quota" : `${container.cpuLimitCores.toFixed(2)} cores`],
            ["Memory usage / limit", `${bytes(container.memoryBytes)} / ${container.memoryLimitBytes === null ? "No limit" : bytes(container.memoryLimitBytes)}`],
            ["Processes / threads", container.pids], ["Worker uptime", elapsed(telemetry!.uptimeSeconds)],
          ]} /> : <p>Container measurements unavailable.</p>}</section>
        </div>
        {worker.latestBuild ? <section className={styles.latest}><h4>Latest build <span>{worker.latestBuild.status}</span></h4><Link href={`/build/${worker.latestBuild.id}`}>Open build {worker.latestBuild.id.slice(0, 8)}</Link>{metrics ? <><Values values={[
          ["Recorded elapsed time", elapsed(metrics.elapsedMs / 1000)],
          ["Peak child process RSS", metrics.peakRssKiB === null ? "Not measured" : bytes(metrics.peakRssKiB * 1024)],
          ["Build cache hits / misses", metrics.cache ? `${metrics.cache.hits} / ${metrics.cache.misses}` : "Unavailable"],
          ["Cache usage verified", metrics.cache ? metrics.cache.usageVerified ? "Yes" : "No" : "Unavailable"],
        ]} /><Values values={Object.entries(metrics.stageDurationsMs).map(([stage, ms]) => [stage.replaceAll("_", " "), elapsed(ms / 1000)])} /></> : <p>Build diagnostics not recorded yet.</p>}</section> : <p>No build diagnostics recorded yet.</p>}
      </div>
    </details>
  </article>;
}

export function WorkerFleet({ workers, now, paginated = false }: { workers: Worker[]; now: number; paginated?: boolean }) {
  const online = workers.filter(worker => workerHealth(worker, now) === "Online").length;
  const active = workers.reduce((sum, worker) => sum + worker.activeBuilds.length, 0);
  const capacity = workers.reduce((sum, worker) => sum + worker.capacity, 0);
  const summary = [
    ["Online workers", online, `of ${workers.length} ${paginated ? "on this page" : "enrolled"}`],
    ["Active builds", active, "Current assignments"],
    ["Build slots", capacity, "Enrolled capacity"],
    ["Other states", workers.length - online, "Offline, stale, draining or revoked"],
  ] as const;
  return <div className={styles.fleet}>
    {paginated && <p className={styles.scope}>Summary for this page</p>}
    <dl className={styles.overview}>{summary.map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><dd className={styles.overviewNote}>{detail}</dd></div>)}</dl>
    {workers.length ? <div className={styles.list}>{workers.map(worker => <WorkerRow key={worker.id} worker={worker} now={now} />)}</div> : <div className={styles.empty}><Server size={28} aria-hidden="true" /><h3>No workers on this page</h3><p>Enroll workers with the operator CLI to start accepting builds.</p></div>}
  </div>;
}
