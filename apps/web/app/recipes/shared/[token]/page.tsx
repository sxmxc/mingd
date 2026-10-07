import { RecipeFileDownload } from "@/components/recipe-file-download";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sharedRecipe } from "@/lib/recipes";
import { CompatibilityGuidance } from "@/components/compatibility-guidance";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function SharedRecipePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recipe = await sharedRecipe(token);
  if (!recipe) notFound();
  return <main id="main-content" className="mx-auto max-w-4xl px-5 py-10">
    <p className="section-label">Shared recipe</p><h1 className="mt-3 text-3xl font-semibold">{recipe.name}</h1>
    <p className="mt-3 text-[var(--muted)]">Godot {recipe.config.godotVersion} · {recipe.config.platform} {recipe.config.architecture} · {recipe.config.templateKinds.join(" + ")}{recipe.config.platform === "web" ? recipe.config.webThreads ? " · threaded" : " · single-threaded" : ""}</p>
    <Link className="tool-action mt-6 inline-flex" href={`/build/new?share=${token}`}>Use this recipe →</Link>
    <div className="mt-4"><RecipeFileDownload name={recipe.name} config={recipe.config} /></div>
    <p className="mt-3 text-sm text-[var(--muted)]">Sign in to customize, save a private copy, or build. This link follows the owner's saved changes.</p>
    <div className="mt-8"><CompatibilityGuidance config={recipe.config} /></div>
    <details className="mt-8"><summary>Full configuration</summary><pre className="mt-4 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(recipe.config, null, 2)}</pre></details>
  </main>;
}
