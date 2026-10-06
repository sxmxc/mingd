export function failureState(attemptsMade: number, attempts: number) {
  const retrying = attemptsMade + 1 < attempts;
  return { status: retrying ? "queued" : "failed", stage: retrying ? "Retry scheduled" : "Build failed", completed_at: retrying ? null : new Date().toISOString() };
}

export function canProcessBuild(record: { user_id: string; config_hash: string; status: string } | null, userId: string, hash: string): boolean {
  if (!record || record.user_id !== userId || record.config_hash !== hash) throw new Error("Queued build does not match its database record.");
  return record.status !== "complete" && record.status !== "failed";
}
