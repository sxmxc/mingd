import { getGodotReleaseCatalog } from "@mingd/build-config";
import { BuildForm } from "@/components/build-form";
import { requireAccount } from "@/lib/access";

export default async function NewBuildPage() {
  await requireAccount();
  const catalog = await getGodotReleaseCatalog();

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-5 py-10">
      <p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--accent)]">New export template</p>
      <h1 className="mt-2 text-3xl font-semibold">Configure a template</h1>
      <p className="mt-3 max-w-3xl text-[var(--muted)]">Choose your Godot version, target, template kinds and engine profile. Review compatibility before removing features.</p>
      <div className="mt-8"><BuildForm versions={catalog.versions} catalogStale={catalog.stale} /></div>
    </main>
  );
}
