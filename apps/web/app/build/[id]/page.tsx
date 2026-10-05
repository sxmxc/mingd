import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuildStatus } from "@/components/build-status";
import { artifactSummaryForOwnedBuild } from "@/lib/build-artifact";

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: build } = await supabase.from("builds").select("id,status,stage,progress,error,log_tail,config,artifact_id,created_at,started_at,completed_at,heartbeat_at,stage_started_at,last_output_at,output_bytes,performance_metrics").eq("id", id).single();
  if (!build) notFound();

  const config = build.config as { godotVersion?: string; platform?: string; architecture?: string; optimization?: string; templateKinds?: string[] };

  return (
    <main className="w-full px-4 py-5 lg:px-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><a href="/dashboard" className="text-xs text-[var(--muted)]">← Builds</a><h1 className="text-lg font-semibold">Godot {config.godotVersion} · {config.platform} {config.architecture}</h1></div>
        <p className="font-mono text-xs text-[var(--muted)]">{build.id.slice(0, 8)} / {config.templateKinds?.join(" + ")} / optimize={config.optimization}</p>
      </div>
      <BuildStatus initial={{ ...build, artifact: await artifactSummaryForOwnedBuild(build.artifact_id) }} />
    </main>
  );
}
