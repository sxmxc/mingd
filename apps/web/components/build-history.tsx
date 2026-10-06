"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildPresetId, normalizeBuildConfig, PRESETS } from "@mingd/build-config";
import { formatBuildTime } from "@/lib/format-build-time";
type Row = { id: string; status: string; stage: string; config: unknown; created_at: string };
function profile(config: unknown) { try { const id = buildPresetId(normalizeBuildConfig(config)); return id ? PRESETS[id].label : "Custom"; } catch { return "Legacy recipe"; } }
export function BuildHistory({ builds }: { builds: Row[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const active = builds.filter(build => !["complete", "failed"].includes(build.status)).length;
  useEffect(() => { if (!active) return; const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10000); return () => clearInterval(timer); }, [active, router]);
  const rows = builds.filter(build => {
    const status = ["complete", "failed"].includes(build.status) ? build.status : "active";
    return (filter === "all" || filter === status) && (`${build.id} ${profile(build.config)} ${JSON.stringify(build.config)}`).toLowerCase().includes(query.toLowerCase());
  });
  return <section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><p className="section-label">{active} active / {builds.filter(b => b.status === "complete").length} ready / latest 50 builds</p><span className="text-xs text-[var(--muted)]">{active ? "Refreshes every 10 seconds" : "No builds running"}</span></div>
    <div className="mb-5 flex flex-wrap gap-3"><input aria-label="Search builds" placeholder="Search target, profile, or build ID…" className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--panel)] p-3 text-sm" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Filter build status" className="rounded border border-[var(--border)] bg-[var(--panel)] p-3 text-sm" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All states</option><option value="active">Active</option><option value="complete">Ready</option><option value="failed">Failed</option></select></div>
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">{rows.map(build => {
      const config = build.config as { platform?: string; godotVersion?: string; architecture?: string };
      return <Link key={build.id} href={`/build/${build.id}`} className="grid gap-3 border-b border-[var(--border)] bg-[var(--panel)] p-5 last:border-0 hover:bg-[var(--panel-2)] md:grid-cols-[1fr_1fr_auto] md:items-center"><div><strong className="text-sm">{profile(build.config)} <span className="font-normal text-[var(--muted)]">/ {config.platform} {config.architecture}</span></strong><p className="mt-2 font-mono text-xs text-[var(--muted)]">Godot {config.godotVersion} · {build.id.slice(0, 8)} · <time dateTime={build.created_at}>{formatBuildTime(build.created_at)}</time></p></div><span className="text-sm text-[var(--muted)]">{build.stage}</span><span className={`status-tag ${build.status}`}>{build.status.replaceAll("_", " ")}</span></Link>;
    })}{!rows.length && <div className="p-10 text-center text-sm text-[var(--muted)]">{builds.length ? "No builds match this filter." : <><p>No builds yet.</p><Link href="/build/new" className="mt-3 inline-block underline">Create your first template</Link></>}</div>}</div>
  </section>;
}
