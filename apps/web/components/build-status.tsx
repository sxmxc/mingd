"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { assertRealBuildSupported, type BuildPerformanceMetrics, type SizeComparison } from "@mingd/build-config";
import Link from "next/link";
import { RecipeFileDownload } from "@/components/recipe-file-download";
import { TemplateSizeComparison } from "@/components/size-comparison";
import { RetryBuild } from "@/components/retry-build";
import { Input } from "@/components/ui/input";

type Build = {
  id: string; status: string; stage: string; progress: number; error: string | null;
  log_tail: string | null; config: Record<string, unknown>; artifact_id: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
  heartbeat_at: string | null; stage_started_at: string | null; last_output_at: string | null; output_bytes: number;
  artifact: { sha256: string; size_bytes: number; binary_size_bytes: number | null; build_recipe_version: string | null; is_dry_run: boolean; comparison?: SizeComparison | null } | null;
  performance_metrics?: BuildPerformanceMetrics | null;
};
const phases = ["queued", "preparing_source", "verifying_source", "preparing_workspace", "compiling", "validating", "packaging", "uploading", "complete"];
const labels = ["Queue", "Source", "Verify", "Workspace", "Compile", "Validate", "Package", "Upload", "Ready"];
const phaseMetrics: string[][] = [[], ["preparing_source"], ["verifying_source"], ["preparing_workspace"], ["compiling", "linking"], ["validating"], ["packaging"], ["uploading", "recording_artifact"], []];
function age(timestamp: string | null, now: number) { return timestamp ? Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000)) : null; }
function duration(seconds: number | null) { if (seconds === null) return "—"; return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function durationMs(milliseconds: number) { return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`; }
function logSeverity(line: string) {
  if (/^\s*(?:\d+\s+)?(?:\[\s*\d+%\]\s*)?ERROR\b/i.test(line) || /^\s*(?:\d+\s+)?(?:\[\s*\d+%\]\s*)?FATAL\b/i.test(line)) return "log-error";
  if (/^\s*(?:\d+\s+)?(?:\[\s*\d+%\]\s*)?WARN(?:ING)?\b/i.test(line)) return "log-warning";
  return "";
}
function highlightedLine(line: string, search: string, nextIndex: { value: number }, activeMatch: number) {
  if (!search) return line;
  const parts: ReactNode[] = [];
  const normalizedLine = line.toLocaleLowerCase();
  const normalizedSearch = search.toLocaleLowerCase();
  let cursor = 0;
  while (cursor < line.length) {
    const match = normalizedLine.indexOf(normalizedSearch, cursor);
    if (match < 0) {
      parts.push(line.slice(cursor));
      break;
    }
    if (match > cursor) parts.push(line.slice(cursor, match));
    const index = nextIndex.value++;
    parts.push(<mark key={`${match}-${index}`} data-log-match="" className={index === activeMatch ? "ring-1 ring-[var(--accent-strong)]" : undefined}>{line.slice(match, match + search.length)}</mark>);
    cursor = match + search.length;
  }
  return parts;
}

export function BuildStatus({ initial }: { initial: Build }) {
  const [build, setBuild] = useState(initial);
  // Use a serialized timestamp for identical server/client initial rendering.
  const [now, setNow] = useState(() => Date.parse(initial.completed_at ?? initial.created_at));
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [panel, setPanel] = useState<"performance" | "artifact" | "recipe">("performance");
  const log = useRef<HTMLPreElement>(null);
  let exportConfig;
  try { exportConfig = assertRealBuildSupported(build.config); } catch { exportConfig = null; }
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
  useEffect(() => { setActiveMatch(0); }, [build.log_tail]);
  const heartbeatAge = age(build.heartbeat_at, now);
  const alive = heartbeatAge !== null && heartbeatAge < 45 && !connectionError;
  const queued = build.status === "queued";
  const elapsed = age(build.started_at ?? build.created_at, build.completed_at ? Date.parse(build.completed_at) : now);
  const phase = phases.indexOf(build.status);
  const metrics = build.performance_metrics;
  const panels = ["performance", "artifact", "recipe"] as const;
  const panelId = `build-${build.id}-diagnostics`;
  const logContent = build.log_tail ?? (queued ? "Waiting for worker…" : "No compiler output received yet.");
  const logLines = logContent.split("\n");
  const logSearchCount = logSearch ? logLines.reduce((count, line) => {
    let offset = 0;
    while ((offset = line.toLocaleLowerCase().indexOf(logSearch.toLocaleLowerCase(), offset)) !== -1) {
      count += 1;
      offset += logSearch.length;
    }
    return count;
  }, 0) : 0;
  const queueDuration = build.started_at
    ? Math.max(0, Math.floor((Date.parse(build.started_at) - Date.parse(build.created_at)) / 1000))
    : null;
  const artifactSize = build.artifact ? `${(build.artifact.size_bytes / 1048576).toFixed(2)} MiB` : "Not available";
  function stageDuration(index: number) {
    if (index === 0) return build.status === "queued" ? age(build.created_at, now) : queueDuration;
    const recorded = phaseMetrics[index].map(key => metrics?.stageDurationsMs[key]).filter((value): value is number => typeof value === "number");
    if (recorded.length) return recorded.reduce((total, value) => total + value, 0) / 1000;
    if (!terminal && index === phase) return age(build.stage_started_at, now);
    return null;
  }
  function stageState(index: number) {
    if (build.status === "failed") {
      if (index === 0) return "done";
      return phaseMetrics[index].some(key => typeof metrics?.stageDurationsMs[key] === "number") ? "observed" : "pending";
    }
    if (build.status === "complete" && metrics?.artifactCacheHit) return index === 0 ? "done" : index === phases.length - 1 ? "done" : "skipped";
    if (build.status === "complete") return "done";
    if (index < phase) return "done";
    if (index === phase) return "current";
    return "pending";
  }
  function navigateLogMatch(direction: number) {
    const matches = log.current?.querySelectorAll<HTMLElement>("[data-log-match]");
    if (!matches?.length) return;
    const next = (activeMatch + direction + matches.length) % matches.length;
    setActiveMatch(next);
    matches[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  const matchIndex = { value: 0 };
  return <div className="build-monitor space-y-3">
    <Card className="monitor-toolbar overflow-hidden">
      <div className="monitor-toolbar-row">
      <div className="min-w-0"><div className="monitor-status-line"><h2 className="flex items-center gap-2 text-base font-semibold">{!terminal && alive && <span className="spinner" />}{build.stage}</h2><span className={`status-tag ${build.status}`}>{build.status.replaceAll("_", " ")}</span></div>
      {!terminal && <p className="mt-2 text-xs text-[var(--muted)]">{queued ? "Waiting for an available worker." : connectionError ?? (alive ? "Worker connected · heartbeat confirms liveness, not compiler progress." : "Heartbeat overdue · check worker health; the build may be stalled.")}</p>}
      {build.status === "complete" && build.artifact && <a href={`/api/builds/${build.id}/download`} className="tool-action mt-2 inline-flex text-xs">{build.artifact.is_dry_run ? "Download diagnostic (not a template)" : "Download template .tpz ↓"}</a>}
      {build.status === "complete" && !build.artifact && <p role="status" className="mt-2 text-xs text-[var(--muted)]">Artifact details are unavailable; the download may not be ready.</p>}
      {build.status === "failed" && <RetryBuild config={build.config} />}
      </div>
      <dl className="monitor-activity" aria-label="Build activity">
        <div><dt>{terminal ? "Total duration" : "Elapsed"}</dt><dd>{duration(elapsed)}</dd></div>
        {terminal ? <>
          {build.artifact && <div><dt>Artifact size</dt><dd>{artifactSize}</dd></div>}
          {build.artifact && <div><dt>SHA-256</dt><dd title={build.artifact.sha256}>{build.artifact.sha256.slice(0, 12)}…</dd></div>}
          {build.status === "failed" && <div><dt>Failure stage</dt><dd>Not recorded</dd></div>}
        </> : <>
          <div><dt>Current stage</dt><dd>{duration(age(build.stage_started_at, now))}</dd></div>
          <div><dt>Worker heartbeat</dt><dd>{heartbeatAge === null ? "Not received" : `${duration(heartbeatAge)} ago`}</dd></div>
          <div><dt>Last output</dt><dd>{build.last_output_at ? `${duration(age(build.last_output_at, now))} ago` : "Not received"}</dd></div>
          <div><dt>Output observed</dt><dd>{Math.round(build.output_bytes / 1024)} KiB</dd></div>
        </>}
      </dl>
      </div>
      <ol className="pipeline" aria-label="Build stages">
        {phases.map((value, index) => {
          const state = stageState(index);
          const seconds = stageDuration(index);
          const failureObservation = state === "observed" ? "Timing recorded; completion could not be confirmed." : null;
          const stateLabel = state === "observed" ? "Outcome unknown" : state === "done" ? "Completed" : state === "current" ? "In progress" : state === "skipped" ? "Skipped for cached artifact" : "Pending";
          return <li key={value} className={state} aria-current={state === "current" ? "step" : undefined} aria-label={`${labels[index]}: ${failureObservation ?? stateLabel}`}>
            <span aria-hidden="true">{state === "done" ? "✓" : index + 1}</span>
            <strong>{labels[index]}</strong>
            <small>{seconds === null ? stateLabel : duration(seconds)}</small>
          </li>;
        })}
        {build.status === "failed" && <li className="failed" aria-label="Build failed; the failing stage was not recorded"><span aria-hidden="true">!</span><strong>Failed</strong><small>Stage unknown</small></li>}
      </ol>
      {build.status === "failed" && <p className="px-4 pb-3 text-xs text-[var(--muted)]">The failure state is recorded, but the exact failing stage is not available.</p>}
      {!terminal && <div className={`activity-track ${alive ? "active" : ""}`} aria-label={alive ? "Worker active; completion time unknown" : "Waiting for activity"}><span /></div>}
      {build.error && <div role="alert" className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--danger)]">{build.error}</div>}
    </Card>
    <div className="monitor-workspace">
    <Card className="monitor-output overflow-hidden">
      <div className="terminal-toolbar">
        <span className="section-label">Compiler output / bounded tail</span>
        <div className="terminal-toolbar-controls flex items-center gap-1">
          <Input aria-label="Search compiler output" className="terminal-search" placeholder="Search output…" value={logSearch} onChange={event => { setLogSearch(event.target.value); setActiveMatch(0); }} />
          <span className="log-search-count" aria-live="polite">{logSearch ? `${logSearchCount ? Math.min(activeMatch + 1, logSearchCount) : 0}/${logSearchCount}` : " "}</span>
          <button type="button" className="terminal-control" aria-label="Previous search match" disabled={!logSearchCount} onClick={() => navigateLogMatch(-1)}>↑</button>
          <button type="button" className="terminal-control" aria-label="Next search match" disabled={!logSearchCount} onClick={() => navigateLogMatch(1)}>↓</button>
          <label className="terminal-control"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow</label>
          <label className="terminal-control"><input type="checkbox" checked={wrapLines} onChange={event => setWrapLines(event.target.checked)} /> Wrap lines</label>
        </div>
      </div>
      <pre ref={log} tabIndex={0} className={`compiler-console${wrapLines ? " wrap-lines" : ""}`} aria-label="Compiler output">{logLines.map((line, index) => <span key={index} className={logSeverity(line)}>{highlightedLine(line, logSearch, matchIndex, activeMatch)}{index < logLines.length - 1 ? "\n" : ""}</span>)}</pre>
    </Card>
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
        {Object.keys(metrics.stageDurationsMs).length === 0 ? <p className="mt-3 text-xs text-[var(--muted)]">No stage timings were recorded.</p> : <div className="mt-3">
          {(() => {
            const entries = Object.entries(metrics.stageDurationsMs);
            const maximum = Math.max(...entries.map(([, milliseconds]) => milliseconds));
            return entries.map(([stage, milliseconds]) => <div key={stage} className="stage-duration">
              <span>{stage.replaceAll("_", " ")}</span>
              <code>{durationMs(milliseconds)}</code>
              <span className="stage-duration-track" aria-label={`${stage.replaceAll("_", " ")} duration relative to the longest measured stage`}><span style={{ width: `${maximum ? Math.max(2, milliseconds / maximum * 100) : 0}%` }} /></span>
            </div>);
          })()}
        </div>}
        <details className="mt-5 text-xs"><summary>Measurement scope</summary><p className="mt-3 leading-5 text-[var(--muted)]">RSS is GNU time's maximum process/child RSS, not total container memory. {metrics.linkingMeasurement === "not-observed" ? "No final-program link marker observed; linking is not separately timed." : "Linking is the observed final-program link interval through process exit; it can include remaining build work."}</p></details>
        {metrics.cache && <details className="mt-4 text-xs"><summary>Compiler & cache diagnostics</summary><dl className="monitor-stage-times mt-3"><div><dt>Compiler</dt><dd>{metrics.cache.compiler}</dd></div><div><dt>Cache version</dt><dd>{metrics.cache.cacheVersion}</dd></div></dl><pre className="monitor-json mt-3">{JSON.stringify(metrics.cache.counters, null, 2)}</pre></details>}
      </>}
      </section>
      <section className="monitor-diagnostics-body" role="tabpanel" id={`${panelId}-artifact`} aria-labelledby={`${panelId}-artifact-tab`} hidden={panel !== "artifact"} tabIndex={0}>
        <h3 className="section-label">Artifact inspector</h3>
        {build.artifact ? <><dl className="monitor-metrics mt-4"><div><dt>Package size</dt><dd>{(build.artifact.size_bytes / 1048576).toFixed(2)} MiB</dd></div><div><dt>Template binaries</dt><dd>{build.artifact.binary_size_bytes === null ? "Not recorded" : `${(build.artifact.binary_size_bytes / 1048576).toFixed(2)} MiB`}</dd></div><div><dt>Recipe version</dt><dd>{build.artifact.build_recipe_version ?? "Legacy"}</dd></div></dl><dl className="monitor-metrics mt-5"><div className="col-span-full"><dt>SHA-256</dt><dd className="select-all text-xs">{build.artifact.sha256}</dd></div></dl>{!build.artifact.is_dry_run && <TemplateSizeComparison comparison={build.artifact.comparison} />}</> : <p className="mt-4 text-sm text-[var(--muted)]">Artifact details appear after a template has been packaged and uploaded successfully.</p>}
      </section>
      <section className="monitor-diagnostics-body" role="tabpanel" id={`${panelId}-recipe`} aria-labelledby={`${panelId}-recipe-tab`} hidden={panel !== "recipe"} tabIndex={0}>
        <h3 className="section-label">Normalized recipe</h3><pre className="monitor-json mt-4">{JSON.stringify(build.config, null, 2)}</pre>
        <div className="mt-4 flex flex-wrap gap-3"><Link className="tool-action inline-flex" href={`/build/new?build=${build.id}`}>Edit / save this recipe</Link>{exportConfig && <RecipeFileDownload name={`Godot ${exportConfig.godotVersion} — ${exportConfig.platform}`} config={exportConfig} />}</div>
      </section>
    </Card>
    </div>
  </div>;
}
