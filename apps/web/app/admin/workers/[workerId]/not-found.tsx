import Link from "next/link";

export default function WorkerNotFound() {
  return <div><h2 className="text-xl font-semibold">Worker not found</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">This worker ID is invalid or the worker is no longer enrolled.</p>
    <Link href="/admin/workers" className="mt-4 inline-block text-sm text-[var(--accent-strong)] hover:underline">← All workers</Link>
  </div>;
}
