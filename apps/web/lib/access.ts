import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export const currentAccount = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const access = await supabase.from("account_roles").select("role,enabled").eq("user_id", data.user.id).maybeSingle();
  if (access.error) throw new Error("Account access could not be checked.");
  return { user: data.user, role: access.data?.role ?? "authenticated", enabled: access.data?.enabled ?? true, supabase };
});
export async function requireAccount(next?: string) {
  const account = await currentAccount();
  if (!account) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  if (!account.enabled) redirect("/account/disabled");
  return account;
}
export async function requireSuperAdmin() {
  const account = await requireAccount();
  if (account.role !== "superadmin") notFound();
  return account;
}
