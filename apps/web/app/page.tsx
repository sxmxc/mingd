import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAccount } from "@/lib/access";
import { Card } from "@/components/ui/card";

const platforms = [
  { name: "Linux", target: "x86_64", description: "Desktop export templates" },
  { name: "Windows", target: "x86_64", description: "Desktop export templates" },
  { name: "Web", target: "wasm32", description: "Browser export templates" },
  { name: "Android", target: "arm64 · arm32 · x86_64 · x86_32", description: "Mobile export templates" },
  { name: "macOS", target: "Universal · arm64 · x86_64", description: "Apple desktop templates" },
];

export default async function HomePage() {
  const account = await currentAccount();
  if (account) redirect(account.enabled ? "/dashboard" : "/account/disabled");

  return <main id="main-content" className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6 sm:py-12">
    <section className="landing-hero grid items-center gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] lg:gap-12">
      <div className="min-w-0">
        <p className="section-label">Godot export-template workbench</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Build only the Godot your game needs.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">Choose the engine features your game uses, build from verified official Godot source, then monitor compiler output and download the matching export template.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="tool-action" href="/login">Sign in</Link>
          <a className="secondary-action" href="#how-it-works">How it works</a>
        </div>
      </div>
      <Card className="workbench-preview overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <span className="font-mono text-xs font-semibold">min.gd / build workflow</span>
          <span className="text-[10px] text-[var(--muted)]">Workbench overview</span>
        </div>
        <ol className="workbench-preview-steps">
          <li><span>01</span><div><strong>Configure a recipe</strong><p>Choose a Godot version, target, and feature set.</p></div></li>
          <li><span>02</span><div><strong>Monitor the build</strong><p>Follow stages, compiler output, and measurements.</p></div></li>
          <li><span>03</span><div><strong>Inspect and download</strong><p>Review artifact details and get the completed output.</p></div></li>
        </ol>
      </Card>
    </section>

    <section aria-labelledby="template-savings" className="mt-9">
      <Card className="landing-benchmark p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(230px,.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-12">
          <div>
            <p className="section-label">Measured template-size comparison</p>
            <h2 id="template-savings" className="mt-3 text-4xl font-semibold tracking-tight text-[var(--success)] sm:text-5xl">85.2% <span className="mt-2 block text-lg font-medium tracking-normal text-[var(--foreground)]">smaller Windows template executable</span></h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Minimal 2D recipe without multiplayer networking.</p>
          </div>
          <dl className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-4"><dt className="text-sm text-[var(--muted)]">Official template</dt><dd className="font-mono text-sm tabular-nums">104.21 MiB</dd></div>
              <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]"><span className="block h-full w-full rounded-full bg-[#647386]" /></div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-4"><dt className="text-sm font-medium">min.gd</dt><dd className="font-mono text-sm tabular-nums text-[var(--success)]">15.47 MiB</dd></div>
              <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]"><span className="block h-full w-[14.8%] rounded-full bg-[var(--success)]" /></div>
            </div>
          </dl>
        </div>
        <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--muted)]">Measured in testing with Godot 4.7.2.stable · Windows x86_64 release executable · Results vary by configuration.</p>
      </Card>
    </section>

    <section aria-labelledby="targets-heading" className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 id="targets-heading" className="text-lg font-semibold">Export targets</h2><p className="mt-1 text-sm text-[var(--muted)]">Choose a platform and architecture in the build form.</p></div>
        <p className="text-xs text-[var(--muted)]">Available version combinations are validated before submission.</p>
      </div>
      <div className="landing-platform-grid grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {platforms.map(platform => <Card key={platform.name} className="p-4">
          <h3 className="text-sm font-semibold">{platform.name}</h3>
          <code className="mt-2 block break-words text-[11px] text-[var(--accent-strong)]">{platform.target}</code>
          <p className="mt-2 text-xs text-[var(--muted)]">{platform.description}</p>
        </Card>)}
      </div>
    </section>

    <section id="how-it-works" aria-labelledby="workflow-heading" className="mt-10 border-t border-[var(--border)] pt-6">
      <h2 id="workflow-heading" className="text-lg font-semibold">From recipe to export</h2>
      <ol className="landing-workflow mt-4 grid gap-4 sm:grid-cols-3">
        <li><span>1</span><div><h3>Choose a recipe</h3><p>Start with a preset, then select the engine features and target you need.</p></div></li>
        <li><span>2</span><div><h3>Watch the build</h3><p>Track build stages, compiler output, and available performance measurements.</p></div></li>
        <li><span>3</span><div><h3>Use the template</h3><p>Inspect the artifact and download it for the matching Godot editor.</p></div></li>
      </ol>
    </section>
  </main>;
}
