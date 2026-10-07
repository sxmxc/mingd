"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthState } from "@/app/auth/actions";
import { siteAnnouncementsSchema } from "@/lib/site-announcements";
export async function changeAccountAccess(_previous: AuthState, form: FormData): Promise<AuthState> {
  const actor = await requireSuperAdmin();
  const input = z.object({ id: z.uuid(), role: z.enum(["authenticated", "superadmin"]), enabled: z.boolean() }).safeParse({ id: form.get("user_id"), role: form.get("role"), enabled: form.get("enabled") === "on" });
  if (!input.success) return { error: "Invalid account access settings." };
  const { error } = await createAdminClient().rpc("set_account_access", { actor_id: actor.user.id, target_id: input.data.id, new_role: input.data.role, new_enabled: input.data.enabled });
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { message: "Access updated." };
}
export async function updateSiteSettings(_previous: AuthState, form: FormData): Promise<AuthState> {
  await requireSuperAdmin();
  const announcements = siteAnnouncementsSchema.safeParse(form.getAll("announcement"));
  if (!announcements.success) return { error: "Add up to 10 announcements, with at most 500 characters each." };
  const { error } = await createAdminClient().from("site_settings").update({ announcements: announcements.data, build_submissions_enabled: form.get("build_submissions_enabled") === "on", updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return { error: "Settings could not be saved." };
  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}
