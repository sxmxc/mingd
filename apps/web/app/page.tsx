import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { currentAccount } from "@/lib/access";
import { Card } from "@/components/ui/card";
export default async function HomePage() {
  const account = await currentAccount();
  if (account) redirect(account.enabled ? "/dashboard" : "/account/disabled");
  return <main id="main-content" className="mx-auto max-w-5xl px-5 py-16">
    <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
      <div className="min-w-0">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Custom Godot export templates.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">Choose the engine features your game uses. Build Linux, Windows, or Web templates from official Godot source.</p>
        <div className="mt-8 flex flex-wrap gap-4"><Link className="tool-action" href="/login">Sign in</Link><a className="rounded border border-[var(--border)] px-5 py-3 text-sm" href="#how-it-works">How it works</a></div>
      </div>
      <Image src="/godot_icon_color.svg" alt="Godot" width={160} height={160} className="h-16 w-16 shrink-0 sm:h-32 sm:w-32 lg:h-40 lg:w-40" />
    </div>
    <section aria-labelledby="template-savings" className="mt-12 border-y border-[var(--border)] py-8 sm:py-10">
      <div className="grid gap-8 sm:grid-cols-2 sm:items-center sm:gap-12">
        <div>
          <h2 id="template-savings" className="text-5xl font-semibold tracking-tight text-[var(--success)] sm:text-6xl">85.2% <span className="mt-2 block text-lg font-medium tracking-normal text-[var(--foreground)]">smaller Windows export template</span></h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Minimal 2D recipe without multiplayer networking.</p>
        </div>
        <dl className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-4"><dt className="text-sm text-[var(--muted)]">Official template</dt><dd className="font-mono text-sm tabular-nums">104.21 MiB</dd></div>
            <div aria-hidden="true" className="mt-2 h-2 rounded-full bg-[var(--border)]" />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-4"><dt className="text-sm font-medium">min.gd</dt><dd className="font-mono text-sm tabular-nums text-[var(--success)]">15.47 MiB</dd></div>
            <div aria-hidden="true" className="mt-2 h-2 w-[14.8%] rounded-full bg-[var(--success)]" />
          </div>
        </dl>
      </div>
      <p className="mt-6 text-xs leading-5 text-[var(--muted)]">Measured in testing with Godot 4.7.2.stable · Windows x86_64 release executable · Results vary by configuration.</p>
    </section>
    <div id="how-it-works" className="mt-12 grid gap-4 sm:grid-cols-3">{[["Choose a recipe", "Select your editor version and target. Start with a preset, then adjust the features."], ["Follow the build", "Watch compiler output and stage timings while your templates compile."], ["Export your game", "Download the template package and install it in the matching Godot editor."]].map(([title, body]) => <Card key={title} className="p-6"><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{body}</p></Card>)}</div>
  </main>;
}
