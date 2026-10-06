import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { basename } from "node:path";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!account.enabled) return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  const { supabase } = account;

  const { data: build, error } = await supabase
    .from("builds")
    .select("artifact_id")
    .eq("id", id)
    .eq("status", "complete")
    .single();
  if (error || !build?.artifact_id) return NextResponse.json({ error: "Artifact not available" }, { status: 404 });

  const admin = createAdminClient();
  const { data: artifact, error: artifactError } = await admin
    .from("artifacts")
    .select("storage_path")
    .eq("id", build.artifact_id)
    .single();
  if (artifactError || !artifact) return NextResponse.json({ error: "Artifact metadata not found" }, { status: 404 });

  const { data: signed, error: signedError } = await admin.storage
    .from(env.artifactBucket())
    .createSignedUrl(artifact.storage_path, env.signedDownloadTtl(), { download: basename(artifact.storage_path) });
  if (signedError) return NextResponse.json({ error: signedError.message }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
