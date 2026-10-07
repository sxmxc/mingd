import Link from "next/link";
import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatBuildTime } from "@/lib/format-build-time";
import { PlatformTarget } from "@/components/platform-target";
export default async function AdminBuildsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page)) || 1));
  const status = ["complete", "failed", "all"].includes(params.status ?? "") ? params.status! : "active";
  const admin = createAdminClient();
  let query = admin.from("builds").select("id,user_id,status,stage,progress,config,created_at,heartbeat_at", { count: "exact" }).order("created_at", { ascending: false });
  if (status === "active") query = query.not("status", "in", "(complete,failed)");
  else if (status !== "all") query = query.eq("status", status);
  const { data, error, count } = await query.range((page - 1) * 50, page * 50 - 1);
  const owners = new Map<string, string>();
  await Promise.all([...new Set((data ?? []).map(b => b.user_id))].map(async id => { const result = await admin.auth.admin.getUserById(id); owners.set(id, result.data.user?.email ?? id); }));
  return <section><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Build tasks <span className="text-[var(--muted)]">({count ?? 0})</span></h2><AutoRefresh /></div><nav aria-label="Build status filter" className="mb-5 flex gap-4 text-sm">{["active", "complete", "failed", "all"].map(value => <Link key={value} href={`/admin?status=${value}`} aria-current={status === value ? "page" : undefined} className={status === value ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}>{value === "all" ? "All builds" : value[0].toUpperCase() + value.slice(1)}</Link>)}</nav>
    {error ? <p role="alert">Could not load build tasks.</p> : <div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="admin-table"><thead><tr><th>Build</th><th>User</th><th>Target</th><th>Status</th><th>Worker heartbeat</th></tr></thead><tbody>{(data ?? []).map(build => <tr key={build.id}><td><Link className="underline" href={`/build/${build.id}`}>{build.id.slice(0, 8)}</Link><div className="mt-1 text-xs text-[var(--muted)]">{formatBuildTime(build.created_at)}</div></td><td className="break-all">{owners.get(build.user_id)}</td><td><PlatformTarget platform={build.config.platform} architecture={build.config.architecture} /><p className="mt-1 text-xs text-[var(--muted)]">Godot {build.config.godotVersion} · {build.config.templateKinds?.join(" + ")}</p></td><td><span className={`status-tag ${build.status}`}>{build.status.replaceAll("_", " ")}</span><div className="mt-2 text-xs text-[var(--muted)]">{build.stage}</div></td><td>{build.heartbeat_at ? formatBuildTime(build.heartbeat_at) : "Not started"}</td></tr>)}</tbody></table>{!data?.length && <p className="p-8 text-sm text-[var(--muted)]">No {status === "all" ? "" : `${status} `}builds.</p>}</div>}
    <div className="mt-5 flex gap-5 text-sm">{page > 1 && <Link href={`/admin?status=${status}&page=${page - 1}`}>Previous</Link>}{page * 50 < (count ?? 0) && <Link href={`/admin?status=${status}&page=${page + 1}`}>Next</Link>}</div>
  </section>;
}
