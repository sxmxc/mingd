/** Bounded compiler diagnostics; never persist known credentials or ANSI control codes. */
export function sanitizeLog(text: string, secrets: string[] = []): string {
  let safe = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  for (const secret of secrets.filter(Boolean)) safe = safe.split(secret).join("[REDACTED]");
  return safe.replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(https?:\/\/|rediss?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@");
}

export class BuildActivity {
  private buffer = "";
  private outputBytes = 0;
  private lastOutputAt: string | null = null;
  constructor(private readonly secrets: string[] = []) {}

  record(chunk: Buffer | string, now = new Date()) {
    const text = chunk.toString();
    this.outputBytes += Buffer.byteLength(text);
    this.lastOutputAt = now.toISOString();
    // Redact the combined buffer so credentials split across chunks are removed.
    this.buffer = (this.buffer + text).slice(-16000);
  }

  snapshot(now = new Date()) {
    return {
      heartbeat_at: now.toISOString(),
      last_output_at: this.lastOutputAt,
      output_bytes: this.outputBytes,
      log_tail: sanitizeLog(this.buffer, this.secrets).slice(-12000) || null,
    };
  }
}
