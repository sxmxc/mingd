import { WorkerMetricsSchema, WorkerTelemetrySchema } from "@mingd/worker-protocol";
import { z } from "zod";

const BuildSummarySchema = z.object({ id: z.uuid(), status: z.string(), stage: z.string().nullable() });
export const WorkerStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  workers: z.array(z.object({
    id: z.uuid(), name: z.string(), target: z.string(), release: z.string(), recipeVersion: z.string(),
    capacity: z.number().int().positive(), disabled: z.boolean(), draining: z.boolean(),
    lastSeenAt: z.string().nullable(), telemetryAt: z.string().nullable(),
    telemetry: z.unknown(),
    activeBuilds: z.array(BuildSummarySchema.extend({ progress: z.number().nullable(), leaseUntil: z.string() })),
    latestBuild: BuildSummarySchema.extend({ metrics: z.unknown(), assignmentState: z.string() }).nullable(),
  })),
});

export function readingAge(timestamp: string | null, now: number): number | null {
  if (!timestamp) return null;
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= -5000 ? Math.max(0, age) : null;
}
export function workerHealth(worker: { disabled: boolean; draining: boolean; lastSeenAt: string | null }, now: number) {
  if (worker.disabled) return "Revoked";
  const age = readingAge(worker.lastSeenAt, now);
  if (age === null || age > 90_000) return "Offline";
  if (age > 45_000) return "Stale";
  return worker.draining ? "Draining" : "Online";
}
export function workerTelemetry(value: unknown) {
  const result = WorkerTelemetrySchema.safeParse(value);
  return result.success ? result.data : null;
}
export function workerBuildMetrics(value: unknown) {
  const result = WorkerMetricsSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function cacheHitRate(hits: number, misses: number) {
  return hits + misses > 0 ? `${(hits / (hits + misses) * 100).toFixed(1)}%` : "No lookups";
}
