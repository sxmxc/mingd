import { z } from "zod";
import { ImageTagSchema, WorkerHelloSchema } from "@mingd/worker-protocol";
import webPackage from "../package.json";
import imageRelease from "../image-release.json";

export const WEB_SERVICE_VERSION = webPackage.version;
export const WEB_IMAGE_TAG = ImageTagSchema.nullable().parse(imageRelease.imageTag);
const GatewayVersionSchema = z.object({
  status: z.literal("ok"), serviceVersion: WorkerHelloSchema.shape.release,
  buildRecipeVersion: z.string().min(1).max(32),
  imageTag: ImageTagSchema.nullable().optional(),
});

// Called on the server after admin authorization. Never forward user credentials.
export async function gatewayServiceVersion(values: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  try {
    const origin = new URL(values.WORKER_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:3001");
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null;
    const response = await fetcher(new URL("/healthz", origin), {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const result = GatewayVersionSchema.safeParse(await response.json());
    return result.success ? result.data : null;
  } catch { return null; }
}
