import Link from "next/link";
import { requireAccount } from "@/lib/access";
import { BuildHistory } from "@/components/build-history";

export default async function DashboardPage() {
  const { supabase, user } = await requireAccount();

  const { data: builds, error } = await supabase
    .from("builds")
    .select("id,status,stage,progress,config,created_at,completed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold">Your builds</h1><p className="mt-2 text-sm text-[var(--muted)]">Templates, progress, and downloads.</p></div>
        <div className="flex shrink-0 gap-3"><Link href="/build/new" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#07111b]">New build</Link></div>
      </div>

      {error ? <p role="alert" className="text-[var(--danger)]">Could not load your builds. Try refreshing the page.</p> : <BuildHistory builds={builds ?? []} />}
    </main>
  );
}
