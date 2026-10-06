import Link from "next/link";
import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessForm } from "@/components/admin-forms";
import { formatBuildTime } from "@/lib/format-build-time";
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireSuperAdmin();
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page)) || 1));
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
  if (error) return <p role="alert">Could not load users.</p>;
  const ids = data.users.map(user => user.id);
  const access = ids.length ? await admin.from("account_roles").select("user_id,role,enabled").in("user_id", ids) : { data: [], error: null };
  if (access.error) return <p role="alert">Could not load account permissions.</p>;
  const roles = new Map((access.data ?? []).map(row => [row.user_id, row]));
  return <section><h2 className="mb-5 text-xl font-semibold">Users</h2><div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="admin-table"><thead><tr><th>Account</th><th>Created</th><th>Access</th></tr></thead><tbody>{data.users.map(user => <tr key={user.id}><td className="break-all">{user.email}<div className="mt-1 text-xs text-[var(--muted)]">{user.email_confirmed_at ? "Email confirmed" : "Email unconfirmed"}</div></td><td className="whitespace-nowrap">{formatBuildTime(user.created_at)}</td><td><AccessForm id={user.id} role={roles.get(user.id)?.role ?? "authenticated"} enabled={roles.get(user.id)?.enabled ?? true} self={user.id === actor.user.id} /></td></tr>)}</tbody></table></div><div className="mt-5 flex gap-5 text-sm">{page > 1 && <Link href={`/admin/users?page=${page - 1}`}>Previous</Link>}{data.users.length === 50 && <Link href={`/admin/users?page=${page + 1}`}>Next</Link>}</div></section>;
}
