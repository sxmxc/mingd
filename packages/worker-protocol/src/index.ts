import { z } from "zod";
import { BuildConfigSchema, BuildFeaturesSchema } from "@mingd/build-config";

export const WORKER_PROTOCOL_VERSION = 1;
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const WORKER_LEASE_SECONDS = 90;
export const WORKER_JSON_BODY_LIMIT_BYTES = 64 * 1024;

export const WorkerTargetSchema = z.enum(["desktop", "web", "android", "macos"]);
export const WorkerIdSchema = z.uuid();
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ReleaseSchema = z.string().max(64).regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
const RecipeVersionSchema = z.string().min(1).max(32);

/** Gateway checks these declarations against its release and enrolled worker. */
export const WorkerHelloSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  release: ReleaseSchema,
  recipeVersion: RecipeVersionSchema,
  target: WorkerTargetSchema,
  toolchainSha256: DigestSchema.nullable(),
}).strict().refine(value => value.target !== "macos" || value.toolchainSha256 !== null, {
  message: "macOS workers must declare their verified toolchain identity.",
  path: ["toolchainSha256"],
});

/** IDs and config come from the gateway; no source URLs, commands or paths cross this boundary. */
export const AssignmentSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  assignmentId: z.uuid(),
  buildId: z.uuid(),
  configHash: DigestSchema,
  config: BuildConfigSchema.safeExtend({ features: BuildFeaturesSchema.strict() }).strict(),
  release: ReleaseSchema,
  recipeVersion: RecipeVersionSchema,
  dryRun: z.boolean(),
  leaseExpiresAt: z.iso.datetime({ offset: true }),
}).strict();

export const CompilerStageSchema = z.enum([
  "preparing_source", "verifying_source", "preparing_workspace", "compiling",
  "linking", "validating", "packaging", "uploading",
]);

const CounterSchema = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const WorkerMetricsSchema = z.object({
  schemaVersion: z.literal(1),
  stageDurationsMs: z.partialRecord(z.enum(["preparing_source", "verifying_source", "preparing_workspace", "compiling", "linking", "validating", "packaging", "uploading", "recording_artifact"]), CounterSchema),
  elapsedMs: CounterSchema, peakRssKiB: CounterSchema.nullable(),
  memoryMeasurement: z.literal("gnu-time-max-child-rss"),
  linkingMeasurement: z.enum(["scons-program-output-until-process-exit", "not-observed"]),
  cache: z.object({ hits: CounterSchema, misses: CounterSchema, usageVerified: z.boolean(),
    counters: z.record(z.string().max(100), CounterSchema).refine(value => Object.keys(value).length <= 100),
    compiler: z.string().max(200), cacheVersion: z.string().max(200),
  }).strict().nullable(), artifactCacheHit: z.boolean(),
}).strict();

/** Receipt time and lease duration are server-owned, never supplied by the worker. */
export const BuildHeartbeatSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  assignmentId: z.uuid(),
  stage: CompilerStageSchema,
  logTail: z.string().max(12_000).nullable(),
  lastOutputAt: z.iso.datetime({ offset: true }).nullable(),
  outputBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  metrics: WorkerMetricsSchema.optional(),
}).strict();

export const LeaseReceiptSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  assignmentId: z.uuid(),
  leaseExpiresAt: z.iso.datetime({ offset: true }),
}).strict();

/** Idle health is separate from assignment ownership and cannot renew a lease. */
export const WorkerHeartbeatReceiptSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  workerId: z.uuid(),
  receivedAt: z.iso.datetime({ offset: true }),
  heartbeatIntervalMs: z.literal(WORKER_HEARTBEAT_INTERVAL_MS),
  draining: z.boolean(),
  acceptingAssignments: z.boolean(),
}).strict();

export const AssignmentPollSchema = z.object({ hello: WorkerHelloSchema }).strict();
export const AssignmentPollReceiptSchema = z.object({ protocolVersion: z.literal(1), assignment: AssignmentSchema.nullable() }).strict();
export const WorkerFailureSchema = z.object({ protocolVersion: z.literal(1), assignmentId: WorkerIdSchema, error: z.string().min(1).max(2000) }).strict();
export const CompletionReceiptSchema = z.object({ protocolVersion: z.literal(1), assignmentId: WorkerIdSchema, artifactId: WorkerIdSchema }).strict();
export const AssignmentStatusSchema = z.object({ protocolVersion: z.literal(1), assignmentId: WorkerIdSchema, artifactId: WorkerIdSchema.nullable() }).strict();

export type WorkerHello = z.infer<typeof WorkerHelloSchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;
export type BuildHeartbeat = z.infer<typeof BuildHeartbeatSchema>;
