"use client";
import { useState } from "react";
export function RetryBuild({ config }: { config: Record<string, unknown> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function retry() {
    setPending(true); setError(undefined);
    try {
      const response = await fetch("/api/builds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(result.error ?? "Could not submit the build. Try again.");
      window.location.assign(`/build/${result.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not connect. Try again."); setPending(false);
    }
  }
  return <div className="mt-2"><button type="button" className="tool-action text-xs" disabled={pending} onClick={retry}>{pending ? "Submitting…" : "Retry this recipe"}</button>{error && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p>}</div>;
}
