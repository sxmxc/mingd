import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/access";
import { BuildStatus } from "@/components/build-status";
import { artifactSummaryForOwnedBuild } from "@/lib/build-artifact";

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAccount();

  const { data: build } = await supabase.from("builds").select("id,status,stage,progress,error,log_tail,config,artifact_id,created_at,started_at,completed_at,heartbeat_at,stage_started_at,last_output_at,output_bytes,performance_metrics").eq("id", id).single();
  if (!build) notFound();

  const config = build.config as { godotVersion?: string; platform?: string; architecture?: string; optimization?: string; templateKinds?: string[] };

  return (
    <main id="main-content" className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <a href="/dashboard" className="inline-flex min-h-8 items-center text-xs text-[var(--accent-strong)] hover:underline">← All builds</a>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Godot {config.godotVersion} · {config.platform} {config.architecture}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            <span>Templates: {config.templateKinds?.join(" + ") ?? "Not specified"}</span>
            <span>Optimization: {config.optimization ?? "Not specified"}</span>
          </div>
        </div>
        <p className="font-mono text-xs text-[var(--muted)]">Build <span className="text-[var(--foreground)]">{build.id}</span></p>
      </div>
      <BuildStatus initial={{ ...build, artifact: await artifactSummaryForOwnedBuild(build.artifact_id) }} />
    </main>
  );
}
