import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { signOut } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: builds, error } = await supabase
    .from("builds")
    .select("id,status,stage,progress,config,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div><p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">Build history</p><h1 className="mt-2 text-3xl font-black">Your templates</h1></div>
        <div className="flex gap-3"><Link href="/build/new" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#07111b]">New build</Link><form action={signOut}><button className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Sign out</button></form></div>
      </div>

      {error && <p className="text-[var(--danger)]">{error.message}</p>}
      <div className="space-y-3">
        {builds?.length ? builds.map((build) => {
          const config = build.config as { godotVersion?: string; platform?: string; architecture?: string };
          return (
            <Link key={build.id} href={`/build/${build.id}`}>
              <Card className="mb-3 grid gap-3 p-4 transition hover:border-[#3b4856] md:grid-cols-[1fr_auto_auto] md:items-center">
                <div><div className="font-semibold">Godot {config.godotVersion} · {config.platform} · {config.architecture}</div><div className="mt-1 text-sm text-[var(--muted)]">{new Date(build.created_at).toLocaleString()}</div></div>
                <div className="font-mono text-sm text-[var(--muted)]">{build.stage}</div>
                <div className="rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wider">{build.status}</div>
              </Card>
            </Link>
          );
        }) : <Card className="p-8 text-center text-[var(--muted)]">No builds yet. Create your first custom template.</Card>}
      </div>
    </main>
  );
}
