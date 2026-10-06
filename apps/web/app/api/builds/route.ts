import { NextResponse } from "next/server";
import { assertRealBuildSupported, cachedArtifactPerformance, resolveGodotVersion } from "@mingd/build-config";
import { currentAccount } from "@/lib/access";
import { getBuildQueue, queueOperation } from "@/lib/queue";
import { hashBuildConfig } from "@/lib/build-hash";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!account.enabled) return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  const auth = { user: account.user };
  const settings = await account.supabase.from("site_settings").select("build_submissions_enabled").eq("id", true).single();
  if (settings.error) return NextResponse.json({ error: "Build settings unavailable" }, { status: 503 });
  if (!settings.data.build_submissions_enabled) return NextResponse.json({ error: "New builds are temporarily paused by an administrator." }, { status: 503 });
  const admin = createAdminClient();

  let config;
  let source;
  try {
    config = assertRealBuildSupported(await request.json());
    source = await resolveGodotVersion(config.godotVersion);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid build configuration" }, { status: 400 });
  }

  const configHash = hashBuildConfig(config, source);
  // Dry-run diagnostics are deliberately never handed out as export templates.
  const { data: artifact } = await admin.from("artifacts").select("id").eq("config_hash", configHash).eq("is_dry_run", false).maybeSingle();

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
      performance_metrics: cachedArtifactPerformance(),
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
    await queueOperation(getBuildQueue(config.platform).add("compile-template", {
      buildId: build.id,
      userId: auth.user.id,
      configHash,
      config,
    }, { jobId: build.id }));
  } catch {
    // The queued database row is a durable outbox; the worker reconciler retries
    // delivery with the same job ID. Never regress a job already picked up.
    await admin.from("builds").update({ stage: "Waiting for queue connection" }).eq("id", build.id).eq("status", "queued");
  }

  return NextResponse.json({ id: build.id, cached: false }, { status: 202 });
}
