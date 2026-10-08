import { createHash, randomBytes, randomUUID } from "node:crypto";

const credentialPattern = /^mingd_worker_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

export function hashWorkerCredential(credential: string): string {
  return createHash("sha256").update(credential).digest("hex");
}

/** Enrollment must store only credentialHash; display credential once to the operator. */
export function createWorkerCredential(workerId: string = randomUUID()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(workerId)) throw new Error("Invalid worker identity.");
  const credential = `mingd_worker_${workerId}.${randomBytes(32).toString("base64url")}`;
  return { workerId, credential, credentialHash: hashWorkerCredential(credential) };
}

/** Parsing is not authentication; each database operation verifies the stored hash. */
export function parseWorkerAuthorization(header: string | undefined): { workerId: string; credentialHash: string } | null {
  if (!header || header.length > 160 || !header.startsWith("Bearer ")) return null;
  const credential = header.slice(7);
  const match = credentialPattern.exec(credential);
  return match && match[0] === credential ? { workerId: match[1], credentialHash: hashWorkerCredential(credential) } : null;
}
