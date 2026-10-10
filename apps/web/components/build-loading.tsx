export function BuildLoading({ label }: { label: string }) {
  return <main id="main-content" className="mx-auto max-w-[1320px] px-5 py-10" aria-busy="true">
    <p role="status" className="text-sm text-[var(--muted)] loading-text">{label}</p>
    <div className="build-loading-skeleton" aria-hidden="true"><div /><div /><div /></div>
  </main>;
}
