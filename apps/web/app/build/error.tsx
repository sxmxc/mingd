"use client";
import Link from "next/link";
export default function BuildError({ retry }: { retry: () => void }) {
  return <main id="main-content" className="mx-auto max-w-3xl px-5 py-10"><div className="build-history-empty rounded-lg border border-[var(--border)] bg-[var(--panel)]">
    <h1 className="text-xl font-semibold">Could not load the build workbench</h1>
    <p>Try loading it again, or return to your build history to check its status.</p>
    <div className="flex flex-wrap justify-center gap-3"><button type="button" className="tool-action" onClick={retry}>Try again</button><Link className="secondary-action" href="/dashboard">Your builds</Link></div>
  </div></main>;
}
