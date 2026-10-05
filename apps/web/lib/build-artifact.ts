import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Call only after the build has been fetched through the user's ownership RLS.
export async function artifactSummaryForOwnedBuild(artifactId: string | null) {
  if (!artifactId) return null;
  const { data } = await createAdminClient().from("artifacts")
    .select("sha256,size_bytes,binary_size_bytes,build_recipe_version,is_dry_run")
    .eq("id", artifactId).maybeSingle();
  return data;
}
