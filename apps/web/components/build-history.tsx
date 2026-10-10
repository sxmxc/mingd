"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildPresetId, normalizeBuildConfig, PRESETS } from "@mingd/build-config";
import { formatBuildTime } from "@/lib/format-build-time";
import { Card } from "@/components/ui/card";
import { PlatformTarget } from "@/components/platform-target";
import { BuildRemoval } from "@/components/build-removal";

type Row = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  config: unknown;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  artifact_id: string | null;
  performance_metrics: { artifactCacheHit?: boolean } | null;
};
type BuildConfigSummary = { platform?: string; architecture?: string; godotVersion?: string; templateKinds?: string[] };
type StatusFilter = "all" | "active" | "complete" | "failed";

function profile(config: unknown) {
  try {
    const id = buildPresetId(normalizeBuildConfig(config));
    return id ? PRESETS[id].label : "Custom";
  } catch {
    return "Legacy recipe";
  }
}

function duration(build: Row, now: number) {
  const start = Date.parse(build.started_at ?? build.created_at);
  const end = build.completed_at ? Date.parse(build.completed_at) : now;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const measured = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return build.completed_at ? measured : `${measured} · live`;
}

function titleCase(value: string | undefined) {
  if (value === "macos") return "macOS";
  return value ? value[0].toUpperCase() + value.slice(1) : "Unknown";
}

export function BuildHistory({ builds }: { builds: Row[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [target, setTarget] = useState("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const active = builds.filter(build => !["complete", "failed"].includes(build.status)).length;
  const [now, setNow] = useState(() => builds.reduce((timestamp, build) => Math.max(timestamp, Date.parse(build.created_at)), 0));
  const queued = builds.filter(build => build.status === "queued").length;
  const ready = builds.filter(build => build.status === "complete").length;
  const failed = builds.filter(build => build.status === "failed").length;
  const cached = builds.filter(build => build.performance_metrics?.artifactCacheHit === true).length;

  useEffect(() => {
    if (!active) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10000);
    return () => { clearInterval(clock); clearInterval(timer); };
  }, [active, router]);

  const targets = useMemo(
    () => [...new Set(builds.map(build => (build.config as BuildConfigSummary).platform).filter((value): value is string => Boolean(value)))].sort(),
    [builds],
  );
  const rows = useMemo(() => builds
    .filter(build => {
      const config = build.config as BuildConfigSummary;
      const statusGroup = ["complete", "failed"].includes(build.status) ? build.status : "active";
      const searchText = `${build.id} ${profile(build.config)} ${JSON.stringify(build.config)}`.toLowerCase();
      return (status === "all" || status === statusGroup)
        && (target === "all" || config.platform === target)
        && searchText.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => sort === "newest"
      ? Date.parse(b.created_at) - Date.parse(a.created_at)
      : Date.parse(a.created_at) - Date.parse(b.created_at)),
  [builds, query, sort, status, target]);

  const summary = [
    ["Active", active, "building or waiting"],
    ["Queued", queued, "waiting for a worker"],
    ["Ready", ready, "completed builds"],
    ["Failed", failed, "on this page"],
    ["Cached", cached, "served from artifact cache"],
  ] as const;

  return <section aria-label="Build history">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="section-label">{builds.length} builds on this page</p>
      <span className="text-xs text-[var(--muted)]">{active ? "Active builds refresh every 10 seconds" : "No builds running"}</span>
    </div>
    <div className="build-summary mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {summary.map(([label, count, detail]) => <Card key={label} className="px-3 py-2.5 sm:px-4">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2"><strong className="font-mono text-xl tabular-nums">{count}</strong><span className="hidden text-right text-[10px] text-[var(--muted)] sm:block">{detail}</span></div>
      </Card>)}
    </div>
    <div className="build-filters mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(130px,auto))_auto]">
      <input aria-label="Search builds on this page" placeholder="Search this page by recipe, target, version, or ID…" className="h-9 min-w-0 rounded-md border px-3 text-sm" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="Filter build status" className="h-9 rounded-md border px-3 text-sm" value={status} onChange={event => setStatus(event.target.value as StatusFilter)}>
        <option value="all">All states</option><option value="active">Active</option><option value="complete">Ready</option><option value="failed">Failed</option>
      </select>
      <select aria-label="Filter build target" className="h-9 rounded-md border px-3 text-sm" value={target} onChange={event => setTarget(event.target.value)}>
        <option value="all">All targets</option>{targets.map(value => <option key={value} value={value}>{titleCase(value)}</option>)}
      </select>
      <select aria-label="Sort builds by creation time" className="h-9 rounded-md border px-3 text-sm" value={sort} onChange={event => setSort(event.target.value as "newest" | "oldest")}>
        <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
      </select>
      <BuildRemoval />
    </div>
    <div className="build-history-cards">
      {rows.map(build => {
        const config = build.config as BuildConfigSummary;
        const cacheHit = build.performance_metrics?.artifactCacheHit === true;
        return <Card key={build.id} className="build-history-card">
          <div className="build-history-card-heading"><h3>{profile(build.config)}</h3><span className={`status-tag ${build.status}`}>{build.status === "complete" ? "Ready" : build.status === "failed" ? "Failed" : build.status === "queued" ? "Queued" : "Building"}</span></div>
          <PlatformTarget platform={config.platform} architecture={config.architecture} />
          <p className="build-history-card-description">Godot {config.godotVersion ?? "—"} · {config.templateKinds?.join(" + ") || "Custom configuration"}</p>
          <p className="build-history-card-stage">{cacheHit ? "Served from artifact cache" : build.stage}</p>
          <dl><div><dt>Duration</dt><dd>{duration(build, now)}</dd></div><div><dt>Created</dt><dd><time dateTime={build.created_at}>{formatBuildTime(build.created_at)}</time></dd></div></dl>
          <div className="build-history-card-actions"><Link href={`/build/${build.id}`} className="row-action">View build</Link>{build.status === "complete" && build.artifact_id && <a href={`/api/builds/${build.id}/download`} className="row-action row-action-primary">Download</a>}{["complete", "failed"].includes(build.status) && <BuildRemoval id={build.id} />}<code title={build.id}>{build.id.slice(0, 8)}</code></div>
        </Card>;
      })}
    </div>
    <div className="build-history-desktop build-table-scroll rounded-md border border-[var(--border)]">
      <table className="build-table">
        <thead><tr><th>Recipe / build ID</th><th>Target</th><th>Godot</th><th>Status</th><th>Duration</th><th>Created</th><th>Artifact</th><th>Actions</th></tr></thead>
        <tbody>{rows.map(build => {
          const config = build.config as BuildConfigSummary;
          const cacheHit = build.performance_metrics?.artifactCacheHit === true;
          const terminalStatus = build.status === "complete" || build.status === "failed";
          return <tr key={build.id}>
            <td>
              <strong>{profile(build.config)}</strong>
              <p className="mt-1 max-w-56 truncate text-xs text-[var(--muted)]">{config.templateKinds?.join(" + ") || "Custom configuration"}</p>
              <code className="mt-1 block text-[11px] text-[var(--accent-strong)]" title={build.id}>{build.id.slice(0, 8)}</code>
            </td>
            <td><PlatformTarget platform={config.platform} architecture={config.architecture} /></td>
            <td className="font-mono text-xs">{config.godotVersion ?? "—"}</td>
            <td>
              <span className={`status-tag ${build.status}`}>{build.status === "complete" ? "Ready" : build.status === "failed" ? "Failed" : build.status === "queued" ? "Queued" : "Building"}</span>
              <p className="mt-1 max-w-40 text-xs text-[var(--muted)]" title={build.stage}>{build.stage}</p>
              {!terminalStatus && build.status !== "queued" && <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{build.progress}%</p>}
            </td>
            <td className="whitespace-nowrap font-mono text-xs tabular-nums">{duration(build, now)}</td>
            <td className="whitespace-nowrap text-xs text-[var(--muted)]"><time dateTime={build.created_at} title={build.created_at}>{formatBuildTime(build.created_at)}</time></td>
            <td>
              {build.status === "complete" && build.artifact_id
                ? <span className="text-xs text-[var(--success)]">{cacheHit ? "Cached artifact" : "Available"}</span>
                : <span className="text-xs text-[var(--muted)]">{build.status === "complete" ? "Unavailable" : "—"}</span>}
            </td>
            <td><div className="flex items-center gap-1.5">
              <Link href={`/build/${build.id}`} className="row-action">View</Link>
              {build.status === "complete" && build.artifact_id && <a href={`/api/builds/${build.id}/download`} className="row-action row-action-primary">Download</a>}
              {terminalStatus && <BuildRemoval id={build.id} />}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!rows.length && <Card className="build-history-empty">
      <h3>{builds.length ? "No matching builds" : "Your first template starts here"}</h3>
      <p>{builds.length ? "Try another search or clear the filters to see your recent builds." : "Choose a target and preset. Your progress and downloads will appear here."}</p>
      {builds.length ? <button type="button" className="secondary-action" onClick={() => { setQuery(""); setStatus("all"); setTarget("all"); }}>Clear filters</button> : <Link href="/build/new" className="tool-action">Create your first template →</Link>}
    </Card>}
    <p className="mt-3 text-xs text-[var(--muted)]" aria-live="polite">Showing {rows.length} of {builds.length} builds on this page. Search, filters, sort, and counts apply to this page.</p>
  </section>;
}
