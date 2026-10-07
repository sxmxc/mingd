import Link from "next/link";
import { requireAccount } from "@/lib/access";
import { RecipeLibrary } from "@/components/recipe-library";

export default async function RecipesPage() {
  const { supabase } = await requireAccount("/recipes");
  const { data, error } = await supabase.from("saved_recipes").select("id,name,config,share_token,updated_at").order("updated_at", { ascending: false }).order("id").limit(100);
  if (error) throw new Error("Recipe library could not be loaded. Check that the recipes migration is applied.");
  return <main id="main-content" className="mx-auto max-w-6xl px-5 py-10">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Saved recipes</h1><p className="mt-3 text-[var(--muted)]">Reuse your configurations or share them with another Godot developer.</p></div><Link className="tool-action" href="/build/new">New recipe</Link></div>
    <RecipeLibrary recipes={data ?? []} />
    {data?.length === 100 && <p className="mt-4 text-sm text-[var(--muted)]">Showing your 100 most recently updated recipes.</p>}
  </main>;
}
