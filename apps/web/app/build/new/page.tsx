import { assertRealBuildSupported, getGodotReleaseCatalog } from "@mingd/build-config";
import { notFound } from "next/navigation";
import { sharedRecipe } from "@/lib/recipes";
import { BuildForm } from "@/components/build-form";
import { requireAccount } from "@/lib/access";

export default async function NewBuildPage({ searchParams }: { searchParams: Promise<{ recipe?: string; share?: string; build?: string }> }) {
  const query = await searchParams;
  const sourceKey = query.recipe ? "recipe" : query.share ? "share" : query.build ? "build" : null;
  const { supabase } = await requireAccount(sourceKey ? `/build/new?${sourceKey}=${encodeURIComponent(query[sourceKey]!)}` : undefined);
  let initialConfig;
  let initialName = "";
  let recipeId;
  if (query.recipe) {
    const { data } = await supabase.from("saved_recipes").select("id,name,config").eq("id", query.recipe).maybeSingle();
    if (!data) notFound();
    initialConfig = assertRealBuildSupported(data.config); initialName = data.name; recipeId = data.id;
  } else if (query.share) {
    const shared = await sharedRecipe(query.share);
    if (!shared) notFound();
    initialConfig = shared.config; initialName = shared.name;
  } else if (query.build) {
    const { data } = await supabase.from("builds").select("config").eq("id", query.build).maybeSingle();
    if (!data) notFound();
    initialConfig = assertRealBuildSupported(data.config);
  }
  const catalog = await getGodotReleaseCatalog();

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-5 py-10">
      <p className="font-mono text-xs uppercase tracking-[.16em] text-[var(--accent-strong)]">New export template / configuration workbench</p>
      <h1 className="mt-2 text-3xl font-semibold">Build a custom Godot template</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">Choose a verified Godot release and export target, review feature dependencies, then build or save a portable recipe. Configuration stays on this page while you move between sections.</p>
      {initialConfig && !catalog.versions.some(version => version.id === initialConfig.godotVersion) ? <p role="alert" className="mt-6 text-[var(--danger)]">This recipe's Godot version is not currently available in the verified release catalog. Try again later; its version has not been substituted.</p> : <div className="mt-6"><BuildForm key={query.recipe ?? query.share ?? query.build ?? "new"} versions={catalog.versions} catalogStale={catalog.stale} macosEnabled={/^[a-f0-9]{64}$/.test(process.env.MACOS_TOOLCHAIN_SHA256 ?? "")} initialConfig={initialConfig} initialName={initialName} recipeId={recipeId} /></div>}
    </main>
  );
}
