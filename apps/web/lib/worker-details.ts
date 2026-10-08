import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { WorkerStatsSchema } from "./worker-health";

export const WorkerIdSchema = z.uuid();

// The caller must authorize SuperAdmin access before passing the server's client.
// Explicit projections exclude worker credentials and build/user metadata.
export async function loadWorkerDetails(db: SupabaseClient, id: string, now: number) {
  WorkerIdSchema.parse(id);
  const worker = await db.from("build_workers").select(
    "id,name,target,release:software_release,recipeVersion:recipe_version,capacity:max_assignments,disabled,draining,lastSeenAt:last_seen_at,telemetry,telemetryAt:telemetry_at",
  ).eq("id", id).maybeSingle();
  if (worker.error) throw new Error("Worker information unavailable.");
  if (!worker.data) return null;

  const [active, latest] = await Promise.all([
    db.from("worker_assignments")
      .select("leaseUntil:lease_until,build:builds!inner(id,status,stage,progress)")
      .eq("worker_id", id).eq("state", "active").gt("lease_until", new Date(now).toISOString())
      .order("created_at").limit(16),
    db.from("worker_assignments")
      .select("assignmentState:state,build:builds!inner(id,status,stage,metrics:performance_metrics)")
      .eq("worker_id", id).order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(1).maybeSingle(),
  ]);
  if (active.error || latest.error) throw new Error("Worker build activity unavailable.");
  const activeRows = z.array(z.object({ leaseUntil: z.string(), build: z.object({
    id: z.uuid(), status: z.string(), stage: z.string().nullable(), progress: z.number().nullable(),
  }) })).parse(active.data);
  const latestRow = z.object({ assignmentState: z.string(), build: z.object({
    id: z.uuid(), status: z.string(), stage: z.string().nullable(), metrics: z.unknown(),
  }) }).nullable().parse(latest.data);
  return WorkerStatsSchema.shape.workers.element.parse({
    ...worker.data,
    activeBuilds: activeRows.map(row => ({ ...row.build, leaseUntil: row.leaseUntil })),
    latestBuild: latestRow ? { ...latestRow.build, assignmentState: latestRow.assignmentState } : null,
  });
}
