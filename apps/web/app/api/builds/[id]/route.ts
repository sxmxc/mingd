import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/access";
import { artifactSummaryForOwnedBuild } from "@/lib/build-artifact";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!account.enabled) return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  const { supabase } = account;

  const { data, error } = await supabase
    .from("builds")
    .select("id,status,stage,progress,error,log_tail,config,artifact_id,created_at,started_at,completed_at,heartbeat_at,stage_started_at,last_output_at,output_bytes,performance_metrics")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Build not found" }, { status: 404 });
  return NextResponse.json({ ...data, artifact: await artifactSummaryForOwnedBuild(data.artifact_id) }, { headers: { "cache-control": "no-store" } });
}
