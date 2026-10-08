import { z } from "zod";
import { BuildConfigSchema, BuildFeaturesSchema } from "@mingd/build-config";

export const WORKER_PROTOCOL_VERSION = 1;
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const WORKER_LEASE_SECONDS = 90;
export const WORKER_JSON_BODY_LIMIT_BYTES = 64 * 1024;

export const WorkerTargetSchema = z.enum(["desktop", "web", "android", "macos"]);
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
  "linking", "validating", "packaging",
]);

/** Receipt time and lease duration are server-owned, never supplied by the worker. */
export const BuildHeartbeatSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  assignmentId: z.uuid(),
  stage: CompilerStageSchema,
  logTail: z.string().max(12_000).nullable(),
  lastOutputAt: z.iso.datetime({ offset: true }).nullable(),
  outputBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

export const LeaseReceiptSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  assignmentId: z.uuid(),
  leaseExpiresAt: z.iso.datetime({ offset: true }),
}).strict();

export type WorkerHello = z.infer<typeof WorkerHelloSchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;
export type BuildHeartbeat = z.infer<typeof BuildHeartbeatSchema>;
