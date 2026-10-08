"use client";

export default function WorkerError({ reset }: { reset: () => void }) {
  return <div role="alert"><h2 className="text-xl font-semibold">Worker details unavailable</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Check the gateway and database migrations, then try again.</p>
    <button onClick={reset} className="mt-4 rounded border border-[var(--border)] px-3 py-2 text-sm">Try again</button>
  </div>;
}
