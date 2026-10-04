import { NextResponse } from "next/server";
import { normalizeBuildConfig } from "@gdslimmer/build-config";
import { createClient } from "@/lib/supabase/server";
import { getBuildQueue } from "@/lib/queue";
import { hashBuildConfig } from "@/lib/build-hash";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  let config;
  try {
    config = normalizeBuildConfig(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid build configuration" }, { status: 400 });
  }

  const configHash = hashBuildConfig(config);
  const { data: artifact } = await admin.from("artifacts").select("id").eq("config_hash", configHash).maybeSingle();

  if (artifact) {
    const { data: build, error } = await admin.from("builds").insert({
      user_id: auth.user.id,
      artifact_id: artifact.id,
      config_hash: configHash,
      status: "complete",
      stage: "Cached artifact",
      progress: 100,
      config,
      completed_at: new Date().toISOString(),
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: build.id, cached: true });
  }

  const { data: build, error } = await admin.from("builds").insert({
    user_id: auth.user.id,
    config_hash: configHash,
    status: "queued",
    stage: "Queued",
    progress: 0,
    config,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await getBuildQueue().add("compile-template", {
      buildId: build.id,
      userId: auth.user.id,
      configHash,
      config,
    }, { jobId: build.id });
  } catch (queueError) {
    await admin.from("builds").update({ status: "failed", stage: "Queue failure", error: String(queueError), completed_at: new Date().toISOString() }).eq("id", build.id);
    return NextResponse.json({ error: "Build could not be queued." }, { status: 503 });
  }

  return NextResponse.json({ id: build.id, cached: false }, { status: 202 });
}
