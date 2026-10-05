"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import type { BuildPerformanceMetrics } from "@mingd/build-config";

type Build = {
  id: string; status: string; stage: string; progress: number; error: string | null;
  log_tail: string | null; config: Record<string, unknown>; artifact_id: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
  heartbeat_at: string | null; stage_started_at: string | null; last_output_at: string | null; output_bytes: number;
  artifact: { sha256: string; size_bytes: number; binary_size_bytes: number | null; build_recipe_version: string | null; is_dry_run: boolean } | null;
  performance_metrics?: BuildPerformanceMetrics | null;
};
const phases = ["queued", "preparing_source", "verifying_source", "preparing_workspace", "compiling", "validating", "packaging", "uploading", "complete"];
const labels = ["Queue", "Source", "Verify", "Workspace", "Compile", "Validate", "Package", "Upload", "Ready"];
function age(timestamp: string | null, now: number) { return timestamp ? Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000)) : null; }
function duration(seconds: number | null) { if (seconds === null) return "—"; return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }

export function BuildStatus({ initial }: { initial: Build }) {
  const [build, setBuild] = useState(initial);
  // Use a serialized timestamp for identical server/client initial rendering.
  const [now, setNow] = useState(() => Date.parse(initial.completed_at ?? initial.created_at));
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [panel, setPanel] = useState<"performance" | "artifact" | "recipe">("performance");
  const log = useRef<HTMLPreElement>(null);
  const terminal = build.status === "complete" || build.status === "failed";
  useEffect(() => {
    if (terminal) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/builds/${initial.id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again to reconnect." : "Monitor connection unavailable. Retrying…");
        setBuild(await response.json()); setConnectionError(null);
      } catch (error) { if (!controller.signal.aborted) setConnectionError(error instanceof Error ? error.message : "Connection lost. Retrying…"); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 2500); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [initial.id, terminal]);
  useEffect(() => { if (terminal) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [terminal]);
  useEffect(() => { if (follow && log.current) log.current.scrollTop = log.current.scrollHeight; }, [build.log_tail, follow]);
  const heartbeatAge = age(build.heartbeat_at, now);
  const alive = heartbeatAge !== null && heartbeatAge < 45 && !connectionError;
  const queued = build.status === "queued";
  const elapsed = age(build.started_at ?? build.created_at, build.completed_at ? Date.parse(build.completed_at) : now);
  const phase = phases.indexOf(build.status);
  const metrics = build.performance_metrics;
  const panels = ["performance", "artifact", "recipe"] as const;
  const panelId = `build-${build.id}-diagnostics`;
  return <div className="build-monitor space-y-3">
    <Card className="monitor-toolbar overflow-hidden">
      <div className="monitor-toolbar-row">
      <div className="min-w-0"><div className="monitor-status-line"><h2 className="flex items-center gap-2 text-base font-semibold">{!terminal && alive && <span className="spinner" />}{build.stage}</h2><span className={`status-tag ${build.status}`}>{build.status.replaceAll("_", " ")}</span></div>
      {!terminal && <p className="mt-2 text-xs text-[var(--muted)]">{queued ? "Waiting for an available worker." : connectionError ?? (alive ? "Worker connected · heartbeat confirms liveness, not compiler progress." : "Heartbeat overdue · check worker health; the build may be stalled.")}</p>}
      {build.status === "complete" && <a href={`/api/builds/${build.id}/download`} className="tool-action mt-2 inline-flex text-xs">{build.artifact?.is_dry_run ? "Download diagnostic (not a template)" : "Download template .tpz ↓"}</a>}
      {build.status === "failed" && <a href="/build/new" className="mt-2 inline-flex text-xs text-[var(--accent)]">Configure another build →</a>}
      </div>
      <dl className="monitor-activity" aria-label="Build activity">
        <div><dt>Elapsed</dt><dd>{duration(elapsed)}</dd></div>
        <div><dt>Current stage</dt><dd>{duration(age(build.stage_started_at, build.completed_at ? Date.parse(build.completed_at) : now))}</dd></div>
        <div><dt>Worker heartbeat</dt><dd>{terminal ? "Stopped" : heartbeatAge === null ? "Not received" : `${duration(heartbeatAge)} ago`}</dd></div>
        <div><dt>Last output</dt><dd>{build.last_output_at ? `${duration(age(build.last_output_at, build.completed_at ? Date.parse(build.completed_at) : now))} ago` : "Not received"}</dd></div>
        <div><dt>Output observed</dt><dd>{Math.round(build.output_bytes / 1024)} KiB</dd></div>
      </dl>
      </div>
      <ol className="pipeline" aria-label="Build stages">{phases.map((value, index) => <li key={value} className={index < phase ? "done" : index === phase ? "current" : ""} aria-current={index === phase ? "step" : undefined}><span>{index < phase ? "✓" : index + 1}</span>{labels[index]}</li>)}</ol>
      {!terminal && <div className={`activity-track ${alive ? "active" : ""}`} aria-label={alive ? "Worker active; completion time unknown" : "Waiting for activity"}><span /></div>}
      {build.error && <div role="alert" className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--danger)]">{build.error}</div>}
    </Card>
    <div className="monitor-workspace">
    <Card className="monitor-output overflow-hidden"><div className="terminal-toolbar"><span className="section-label">Compiler output / bounded tail</span><label className="text-xs"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow output</label></div><pre ref={log} tabIndex={0} className="compiler-console">{build.log_tail ?? (queued ? "Waiting for worker…" : "No compiler output received yet.")}</pre></Card>
    <Card className="monitor-diagnostics overflow-hidden">
      <div className="monitor-tabs" role="tablist" aria-label="Build diagnostics" onKeyDown={event => {
        const index = panels.indexOf(panel);
        const next = event.key === "ArrowRight" ? (index + 1) % panels.length : event.key === "ArrowLeft" ? (index + panels.length - 1) % panels.length : event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setPanel(panels[next]);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
      }}>
        {panels.map(value => <button key={value} type="button" role="tab" id={`${panelId}-${value}-tab`} aria-controls={`${panelId}-${value}`} aria-selected={panel === value} tabIndex={panel === value ? 0 : -1} onClick={() => setPanel(value)}>{value === "performance" ? "Performance" : value === "artifact" ? "Artifact" : "Recipe"}</button>)}
      </div>
      <section className="monitor-diagnostics-body" role="tabpanel" id={`${panelId}-performance`} aria-labelledby={`${panelId}-performance-tab`} hidden={panel !== "performance"} tabIndex={0}>
      <h3 className="section-label">Performance & cache</h3>
      {!metrics ? <p className="mt-4 text-xs text-[var(--muted)]">No measurements recorded for this build.</p> : metrics.artifactCacheHit ? <p className="mt-4 text-sm">Artifact reused. No compiler ran for this request.</p> : <>
        <dl className="monitor-metrics mt-4">
          <div><dt>Peak process RSS</dt><dd>{metrics.peakRssKiB === null ? "Not measured" : `${(metrics.peakRssKiB / 1024).toFixed(1)} MiB`}</dd></div>
          <div><dt>Compiler cache</dt><dd>{metrics.cache ? metrics.cache.usageVerified ? `${metrics.cache.hits} hits / ${metrics.cache.misses} misses` : "No cacheable calls observed" : terminal ? "Diagnostics unavailable" : "Collected after compilation"}</dd></div>
        </dl>
        <h4 className="section-label mt-6">Stage durations</h4>
        <dl className="monitor-stage-times mt-3">{Object.entries(metrics.stageDurationsMs).map(([stage, ms]) => <div key={stage}><dt>{stage.replaceAll("_", " ")}</dt><dd>{(ms / 1000).toFixed(1)}s</dd></div>)}</dl>
        <details className="mt-5 text-xs"><summary>Measurement scope</summary><p className="mt-3 leading-5 text-[var(--muted)]">RSS is GNU time's maximum process/child RSS, not total container memory. {metrics.linkingMeasurement === "not-observed" ? "No final-program link marker observed; linking is not separately timed." : "Linking is the observed final-program link interval through process exit; it can include remaining build work."}</p></details>
        {metrics.cache && <details className="mt-4 text-xs"><summary>Compiler & cache diagnostics</summary><dl className="monitor-stage-times mt-3"><div><dt>Compiler</dt><dd>{metrics.cache.compiler}</dd></div><div><dt>Cache version</dt><dd>{metrics.cache.cacheVersion}</dd></div></dl><pre className="monitor-json mt-3">{JSON.stringify(metrics.cache.counters, null, 2)}</pre></details>}
      </>}
      </section>
      <section className="monitor-diagnostics-body" role="tabpanel" id={`${panelId}-artifact`} aria-labelledby={`${panelId}-artifact-tab`} hidden={panel !== "artifact"} tabIndex={0}>
        <h3 className="section-label">Artifact inspector</h3>
        {build.artifact ? <><dl className="monitor-metrics mt-4"><div><dt>Package size</dt><dd>{(build.artifact.size_bytes / 1048576).toFixed(2)} MiB</dd></div><div><dt>Main binary</dt><dd>{build.artifact.binary_size_bytes === null ? "Not recorded" : `${(build.artifact.binary_size_bytes / 1048576).toFixed(2)} MiB`}</dd></div><div><dt>Recipe version</dt><dd>{build.artifact.build_recipe_version ?? "Legacy"}</dd></div></dl><dl className="monitor-metrics mt-5"><div className="col-span-full"><dt>SHA-256</dt><dd className="select-all text-xs">{build.artifact.sha256}</dd></div></dl></> : <p className="mt-4 text-sm text-[var(--muted)]">Artifact details appear after a template has been packaged and uploaded successfully.</p>}
      </section>
      <section className="monitor-diagnostics-body" role="tabpanel" id={`${panelId}-recipe`} aria-labelledby={`${panelId}-recipe-tab`} hidden={panel !== "recipe"} tabIndex={0}>
        <h3 className="section-label">Normalized recipe</h3><pre className="monitor-json mt-4">{JSON.stringify(build.config, null, 2)}</pre>
      </section>
    </Card>
    </div>
  </div>;
}
