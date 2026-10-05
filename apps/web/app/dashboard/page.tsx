import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuildHistory } from "@/components/build-history";
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
        <div><p className="section-label">Workspace / recipes & artifacts</p><h1 className="mt-2 text-3xl font-semibold">Build workbench</h1></div>
        <div className="flex gap-3"><Link href="/build/new" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#07111b]">New build</Link><form action={signOut}><button className="rounded-md border border-[var(--border)] px-4 py-2 text-sm">Sign out</button></form></div>
      </div>

      {error && <p className="text-[var(--danger)]">{error.message}</p>}
      <BuildHistory builds={builds ?? []} />
    </main>
  );
}
