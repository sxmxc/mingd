import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuildStatus } from "@/components/build-status";

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: build } = await supabase.from("builds").select("id,status,stage,progress,error,log_tail,config,artifact_id").eq("id", id).single();
  if (!build) notFound();

  const config = build.config as { godotVersion?: string; platform?: string; architecture?: string; optimization?: string; templateKinds?: string[] };

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">Build {build.id.slice(0, 8)}</p>
      <h1 className="mt-2 text-3xl font-black">Godot {config.godotVersion} · {config.platform} {config.architecture}</h1>
      <p className="mt-3 text-[var(--muted)]">{config.templateKinds?.join(" + ")} · optimize={config.optimization}</p>
      <div className="mt-8"><BuildStatus initial={build} /></div>
    </main>
  );
}
