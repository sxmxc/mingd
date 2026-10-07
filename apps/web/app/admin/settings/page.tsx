import { requireSuperAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "@/components/admin-forms";
export default async function AdminSettingsPage() {
  await requireSuperAdmin();
  const { data, error } = await createAdminClient().from("site_settings").select("build_submissions_enabled,announcements").eq("id", true).single();
  if (error) return <p role="alert">Could not load settings.</p>;
  return <section><h2 className="mb-6 text-xl font-semibold">Site settings</h2><SettingsForm enabled={data.build_submissions_enabled} announcements={data.announcements} /></section>;
}
