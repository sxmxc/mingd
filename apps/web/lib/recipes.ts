import "server-only";
import { assertRealBuildSupported } from "@mingd/build-config";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sharedRecipe(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("saved_recipes").select("name,config,user_id").eq("share_token", token).maybeSingle();
  if (error) throw new Error("Shared recipe could not be loaded.");
  if (!data) return null;
  const access = await admin.from("account_roles").select("enabled").eq("user_id", data.user_id).maybeSingle();
  if (access.error) throw new Error("Recipe access could not be checked.");
  if (access.data?.enabled === false) return null;
  try { return { name: data.name as string, config: assertRealBuildSupported(data.config) }; }
  catch { return null; }
}
