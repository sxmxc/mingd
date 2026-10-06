import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAccount } from "@/lib/access";
import { Card } from "@/components/ui/card";
export default async function HomePage() {
  const account = await currentAccount();
  if (account) redirect(account.enabled ? "/dashboard" : "/account/disabled");
  return <main id="main-content" className="mx-auto max-w-5xl px-5 py-16">
    <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Custom Godot export templates.</h1>
    <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">Choose the engine features your game uses. Build Linux, Windows, or Web templates from official Godot source.</p>
    <div className="mt-8 flex flex-wrap gap-4"><Link className="tool-action" href="/login">Sign in</Link><a className="rounded border border-[var(--border)] px-5 py-3 text-sm" href="#how-it-works">How it works</a></div>
    <section aria-labelledby="template-savings" className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 sm:p-8">
      <h2 id="template-savings" className="text-2xl font-semibold tracking-tight sm:text-3xl">84.3% smaller Windows export template</h2>
      <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">In testing with Godot 4.7.2.stable, our minimal 2D recipe without multiplayer networking reduced the Windows x86_64 release executable from <strong className="font-semibold text-[var(--foreground)]">98.40 MiB to 15.47 MiB</strong> compared with the official template.</p>
      <p className="mt-3 text-sm text-[var(--muted)]">Results vary by configuration.</p>
    </section>
    <div id="how-it-works" className="mt-12 grid gap-4 sm:grid-cols-3">{[["Choose a recipe", "Select your editor version and target. Start with a preset, then adjust the features."], ["Follow the build", "Watch compiler output and stage timings while your templates compile."], ["Export your game", "Download the template package and install it in the matching Godot editor."]].map(([title, body]) => <Card key={title} className="p-6"><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{body}</p></Card>)}</div>
  </main>;
}
