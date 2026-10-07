import Link from "next/link";
import { requireAccount } from "@/lib/access";
import { BuildHistory } from "@/components/build-history";

export default async function DashboardPage() {
  const { supabase, user } = await requireAccount();

  const { data: builds, error } = await supabase
    .from("builds")
    .select("id,status,stage,progress,config,created_at,started_at,completed_at,artifact_id,performance_metrics")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main id="main-content" className="mx-auto max-w-[1320px] px-4 py-7 sm:px-6 lg:py-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold">Your builds</h1><p className="mt-2 text-sm text-[var(--muted)]">Templates, progress, and downloads.</p></div>
        <Link href="/build/new" className="tool-action">+ New build</Link>
      </div>

      {error ? <p role="alert" className="text-[var(--danger)]">Could not load your builds. Try refreshing the page.</p> : <BuildHistory builds={builds ?? []} />}
    </main>
  );
}
