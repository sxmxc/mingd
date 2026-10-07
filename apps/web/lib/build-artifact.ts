import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareTemplateSize, type TemplateReference } from "@mingd/build-config";

// Call only after the build has been fetched through ownership/SuperAdmin RLS.
export async function artifactSummaryForOwnedBuild(artifactId: string | null) {
  if (!artifactId) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("artifacts")
    .select("sha256,size_bytes,binary_size_bytes,build_recipe_version,is_dry_run,normalized_config,godot_version,platform,architecture")
    .eq("id", artifactId).maybeSingle();
  if (!data) return null;
  const { normalized_config, godot_version, platform, architecture, ...summary } = data;
  if (data.is_dry_run) return { ...summary, comparison: null };
  const references = await admin.from("official_template_references")
    .select("godot_version,platform,architecture,template_kind,web_threads,binary_size_bytes,archive_sha256,source_url,measured_at")
    .eq("godot_version", godot_version).eq("platform", platform).eq("architecture", architecture);
  return { ...summary, comparison: compareTemplateSize(normalized_config, data.binary_size_bytes, data.is_dry_run, (references.data ?? []) as TemplateReference[]) };
}
