import Link from "next/link";
export default function BuildNotFound() {
  return <main id="main-content" className="mx-auto max-w-3xl px-5 py-10"><div className="build-history-empty rounded-lg border border-[var(--border)] bg-[var(--panel)]">
    <h1 className="text-xl font-semibold">Build or recipe unavailable</h1><p>It may no longer exist, or your account may not have access.</p><Link className="tool-action" href="/dashboard">Return to your builds</Link>
  </div></main>;
}
