import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, Minus } from "lucide-react";
import { PRESETS } from "@mingd/build-config";
import { currentAccount } from "@/lib/access";
import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/platform-target";
import { LandingComparisons } from "@/components/landing-comparisons";

const platforms = [
  { id: "windows", name: "Windows", target: "x86_64" },
  { id: "linux", name: "Linux", target: "x86_64" },
  { id: "web", name: "Web", target: "Single-threaded or threaded" },
  { id: "android", name: "Android", target: "ARM64 · ARMv7 · x86_64 · x86" },
  { id: "macos", name: "macOS", target: "Apple Silicon · Intel · Universal" },
];
const exampleFeatures = [
  { label: "2D physics", included: PRESETS.offline2d.features.physics2d },
  { label: "Advanced text shaping", included: PRESETS.offline2d.features.textServer === "advanced" },
  { label: "3D engine", included: PRESETS.offline2d.features.engine3d },
  { label: "Multiplayer networking", included: PRESETS.offline2d.features.multiplayer },
];

export default async function HomePage() {
  const account = await currentAccount();
  if (account) redirect(account.enabled ? "/dashboard" : "/account/disabled");

  return <main id="main-content" className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 sm:py-14">
    <section className="landing-hero grid items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,.9fr)] lg:gap-14">
      <div className="min-w-0">
        <div className="flex items-center gap-3"><img src="/godot_icon_color.svg" width={44} height={44} alt="" className="h-11 w-11 shrink-0" /><p className="section-label">Custom templates for Godot 4</p></div>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">Smaller Godot<br className="hidden sm:block" /> export templates.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">Choose the engine features your game uses. min.gd builds a custom export template from official Godot source, ready to install in your editor.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="tool-action" href="/login">Sign in to build <ArrowRight size={16} aria-hidden="true" /></Link>
          <a className="secondary-action" href="#how-it-works">How it works</a>
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">No local compiler setup required.</p>
      </div>
      <Card className="workbench-preview min-w-0 overflow-hidden" role="region" aria-label="Example Offline 2D recipe">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{PRESETS.offline2d.label}</h2><span className="font-mono text-[10px] text-[var(--muted)]">Example recipe</span></div>
          <p className="mt-1 text-xs text-[var(--muted)]">2D features kept. 3D and multiplayer removed.</p>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-b border-[var(--border)] px-5 py-3 text-xs">
          {[["Godot", "4.7.2"], ["Target", "Windows x64"], ["Template", "Release"]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-[var(--muted)]">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
        </dl>
        <ul className="space-y-3.5 px-5 py-4">
          {exampleFeatures.map(feature => <li key={feature.label} className="flex items-center justify-between gap-3 text-xs">
            <span>{feature.label}</span><span className={`inline-flex shrink-0 items-center gap-1.5 ${feature.included ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>{feature.included ? <Check size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}{feature.included ? "Included" : "Removed"}</span>
          </li>)}
        </ul>
        <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)]">Download as an installable <code className="text-[var(--foreground)]">.tpz</code> archive.</p>
      </Card>
    </section>

    <section aria-labelledby="targets-heading" className="mt-10 sm:mt-12">
      <h2 id="targets-heading" className="mb-3 text-sm font-semibold">Supported targets</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {platforms.map(platform => <div key={platform.id} className="min-w-0 rounded-md border border-[var(--border)] px-3 py-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold"><PlatformIcon platform={platform.id} className="h-4 w-4 shrink-0" />{platform.name}</h3>
          <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">{platform.target}</p>
        </div>)}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">Android and macOS templates are available for Godot 4.6.3 and 4.7.2.</p>
    </section>

    <LandingComparisons />

    <section id="how-it-works" aria-labelledby="workflow-heading" className="mt-10 scroll-mt-20 border-t border-[var(--border)] pt-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="workflow-heading" className="text-xl font-semibold">From build settings to your editor</h2><Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-strong)]">Sign in to build <ArrowRight size={14} aria-hidden="true" /></Link></div>
      <ol className="landing-workflow mt-5 grid gap-6 sm:grid-cols-3">
        <li><span>1</span><div><h3>Choose your features</h3><p>Start with a preset, then keep the rendering, physics, UI, and file formats your project needs.</p></div></li>
        <li><span>2</span><div><h3>Build the template</h3><p>Follow the compiler output as your template builds. Save the recipe to use those settings again.</p></div></li>
        <li><span>3</span><div><h3>Install the template</h3><p>Download the .tpz and install it through Manage Export Templates in the matching Godot editor.</p></div></li>
      </ol>
    </section>
  </main>;
}
