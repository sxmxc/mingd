import Link from "next/link";
import { requireAccount } from "@/lib/access";
import { BuildHistory } from "@/components/build-history";
import { redirect } from "next/navigation";
import { buildHistoryPage, BUILD_HISTORY_PAGE_SIZE } from "@/lib/build-history-management";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { supabase, user } = await requireAccount();
  const page = buildHistoryPage((await searchParams).page);
  const { count, error: countError } = await supabase.from("builds")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id);
  const pages = Math.max(1, Math.ceil((count ?? 0) / BUILD_HISTORY_PAGE_SIZE));
  if (!countError && page > pages) redirect(`/dashboard?page=${pages}`);

  const { data: builds, error } = countError ? { data: null, error: countError } : await supabase
    .from("builds")
    .select("id,status,stage,progress,config,created_at,started_at,completed_at,artifact_id,performance_metrics")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * BUILD_HISTORY_PAGE_SIZE, page * BUILD_HISTORY_PAGE_SIZE - 1);
  if (!error && page > 1 && !builds?.length) redirect(`/dashboard?page=${page - 1}`);

  return (
    <main id="main-content" className="mx-auto max-w-[1320px] px-4 py-7 sm:px-6 lg:py-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold">Your builds</h1><p className="mt-2 text-sm text-[var(--muted)]">Templates, progress, and downloads.</p></div>
        <Link href="/build/new" className="tool-action">+ New build</Link>
      </div>

      {error ? <p role="alert" className="text-[var(--danger)]">Could not load your builds. Try refreshing the page.</p> : <>
        <BuildHistory builds={builds ?? []} />
        <nav aria-label="Build history pages" className="build-history-pagination">
          <p>Page {page} of {pages} · {count ?? 0} builds</p>
          <div>{page > 1 && <Link className="secondary-action" href={`/dashboard?page=${page - 1}`}>← Previous</Link>}{page < pages && <Link className="secondary-action" href={`/dashboard?page=${page + 1}`}>Next →</Link>}</div>
        </nav>
      </>}
    </main>
  );
}
