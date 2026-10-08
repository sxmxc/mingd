/** Gateway-owned messages only; never wrap unchecked worker/backend errors. */
export class DeliveryError extends Error {}

export class UploadCapacityError extends Error {
  constructor() { super("Artifact upload capacity unavailable."); }
}

export class ArtifactOperationError extends Error {
  constructor(readonly operation: "reservation" | "storage_upload" | "measurements" | "commit") {
    super("Artifact publication unavailable.");
  }
}
