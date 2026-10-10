import { readFileSync } from "node:fs";
import { ImageTagSchema, WorkerHelloSchema } from "@mingd/worker-protocol";

// Read metadata shipped with this process, independently of enrollment and runtime environment.
export const BUILDER_SERVICE_VERSION = WorkerHelloSchema.shape.release.parse(
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
);
export const BUILDER_IMAGE_TAG = ImageTagSchema.nullable().parse(
  JSON.parse(readFileSync(new URL("../image-release.json", import.meta.url), "utf8")).imageTag,
);
