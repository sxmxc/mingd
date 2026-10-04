import { redirect } from "next/navigation";
import { BuildForm } from "@/components/build-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewBuildPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">New export template</p>
      <h1 className="mt-2 text-3xl font-black">Configure your Godot runtime</h1>
      <p className="mt-3 max-w-3xl text-[var(--muted)]">The bootstrap exposes a conservative subset of Godot's build flags. More aggressive module removal should be added only with dependency rules and tests.</p>
      <div className="mt-8"><BuildForm /></div>
    </main>
  );
}
