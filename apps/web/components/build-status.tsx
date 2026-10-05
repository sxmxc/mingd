"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";

type Build = {
  id: string; status: string; stage: string; progress: number; error: string | null;
  log_tail: string | null; config: Record<string, unknown>; artifact_id: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
  heartbeat_at: string | null; stage_started_at: string | null; last_output_at: string | null; output_bytes: number;
  artifact: { sha256: string; size_bytes: number; binary_size_bytes: number | null; build_recipe_version: string | null; is_dry_run: boolean } | null;
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
  return <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
    <div className="space-y-5"><Card className="p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="section-label">Build monitor / {build.id.slice(0, 8)}</p><h2 className="mt-3 flex items-center gap-3 text-xl font-semibold">{!terminal && alive && <span className="spinner" />}{build.stage}</h2></div><span className={`status-tag ${build.status}`}>{build.status.replaceAll("_", " ")}</span></div>
      {!terminal && <p className="mt-4 text-sm text-[var(--muted)]">{queued ? "Waiting for an available worker. Compilation has not started." : connectionError ?? (alive ? "Worker heartbeat received. Build process is active; this does not guarantee compiler progress." : "Worker heartbeat is overdue or unavailable. The build may be stalled; check worker health.")}</p>}
      <ol className="pipeline mt-6" aria-label="Build stages">{phases.map((value, index) => <li key={value} className={index < phase ? "done" : index === phase ? "current" : ""} aria-current={index === phase ? "step" : undefined}><span>{index < phase ? "✓" : index + 1}</span>{labels[index]}</li>)}</ol>
      {!terminal && <div className={`activity-track mt-6 ${alive ? "active" : ""}`} aria-label={alive ? "Worker active; completion time unknown" : "Waiting for activity"}><span /></div>}
      {build.error && <div role="alert" className="tool-note mt-5 text-[var(--danger)]">{build.error}</div>}
      {build.status === "complete" && <a href={`/api/builds/${build.id}/download`} className="tool-action mt-6 inline-flex">{build.artifact?.is_dry_run ? "Download diagnostic (not a template)" : "Download template .tpz ↓"}</a>}
      {build.status === "failed" && <a href="/build/new" className="tool-action mt-6 inline-flex">Configure another build →</a>}
    </Card>
    <Card className="overflow-hidden"><div className="terminal-toolbar"><span className="section-label">Compiler output / bounded tail</span><label className="text-xs"><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow output</label></div><pre ref={log} tabIndex={0} className="compiler-console">{build.log_tail ?? (queued ? "Waiting for worker…" : "No compiler output received yet.")}</pre></Card></div>
    <aside className="space-y-5"><Card className="p-5"><p className="section-label">Activity inspector</p><dl className="inspector mt-5"><dt>Elapsed</dt><dd>{duration(elapsed)}</dd><dt>Current stage</dt><dd>{duration(age(build.stage_started_at, build.completed_at ? Date.parse(build.completed_at) : now))}</dd><dt>Worker heartbeat</dt><dd>{terminal ? "Stopped · terminal state" : heartbeatAge === null ? "Not received" : `${duration(heartbeatAge)} ago`}</dd><dt>Last output</dt><dd>{build.last_output_at ? `${duration(age(build.last_output_at, build.completed_at ? Date.parse(build.completed_at) : now))} ago` : "Not received"}</dd><dt>Output observed</dt><dd>{Math.round(build.output_bytes / 1024)} KiB</dd></dl><p className="mt-5 text-xs leading-5 text-[var(--muted)]">Compilation and linking can be quiet. Heartbeats report worker liveness, not a percentage or time remaining.</p></Card>
    {build.artifact && <Card className="p-5"><p className="section-label">Artifact inspector</p><dl className="inspector mt-3"><dt>Package size</dt><dd>{(build.artifact.size_bytes / 1048576).toFixed(2)} MiB</dd><dt>Main binary</dt><dd>{build.artifact.binary_size_bytes === null ? "Not recorded" : `${(build.artifact.binary_size_bytes / 1048576).toFixed(2)} MiB`}</dd><dt>Recipe version</dt><dd>{build.artifact.build_recipe_version ?? "Legacy"}</dd><dt>SHA-256</dt><dd className="select-all text-xs">{build.artifact.sha256}</dd></dl></Card>}
    <Card className="p-5"><details><summary className="section-label">Normalized recipe</summary><pre className="mt-4 overflow-auto text-xs">{JSON.stringify(build.config, null, 2)}</pre></details></Card></aside>
  </div>;
}
