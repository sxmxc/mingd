"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { assertRealBuildSupported } from "@mingd/build-config";
import { RecipeFileDownload } from "@/components/recipe-file-download";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RecipeLibrary({ recipes }: { recipes: { id: string; name: string; config: unknown; share_token: string | null; updated_at: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  async function action(id: string, operation: "share" | "stop-sharing" | "duplicate" | "delete", recipe: typeof recipes[number]) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(operation === "duplicate" ? "/api/recipes" : `/api/recipes/${id}`, {
        method: operation === "duplicate" ? "POST" : operation === "delete" ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(operation === "duplicate" ? { name: `${recipe.name.slice(0, 73)} (copy)`, config: recipe.config } : { action: operation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Recipe update failed.");
      setMessage(operation === "share" ? "Share link created. Anyone with the link can view the saved configuration. Edits update it." : operation === "stop-sharing" ? "Share link revoked." : operation === "duplicate" ? "Recipe duplicated." : "Recipe deleted.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connection failed."); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 space-y-4">
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {message && <p role="status" className="text-sm text-[var(--success)]">{message}</p>}
    {!recipes.length && <Card className="p-6 text-[var(--muted)]">No saved recipes yet. Configure a template and choose Save recipe.</Card>}
    {recipes.map(recipe => {
      let config;
      try { config = assertRealBuildSupported(recipe.config); } catch { config = null; }
      return <Card key={recipe.id} className="p-5">
        <h2 className="text-lg font-semibold">{recipe.name}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{config ? `Godot ${config.godotVersion} · ${config.platform} ${config.architecture} · ${config.templateKinds.join(" + ")}${config.platform === "web" ? config.webThreads ? " · threaded" : " · single-threaded" : ""}` : "This recipe is no longer supported."}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {config && <Link className="tool-action" href={`/build/new?recipe=${recipe.id}`}>Edit / build</Link>}
          {config && <RecipeFileDownload name={recipe.name} config={config} />}
          <Button type="button" variant="secondary" disabled={busy || !config} onClick={() => void action(recipe.id, "duplicate", recipe)}>Duplicate</Button>
          <Button type="button" variant="secondary" disabled={busy || !config} onClick={() => void action(recipe.id, recipe.share_token ? "stop-sharing" : "share", recipe)}>{recipe.share_token ? "Stop sharing" : "Create share link"}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { if (window.confirm(`Delete “${recipe.name}”? Its share link will stop working.`)) void action(recipe.id, "delete", recipe); }}>Delete</Button>
        </div>
        {recipe.share_token && <div className="mt-4 space-y-2"><label className="block text-xs text-[var(--muted)]">Share link<input readOnly aria-label={`Share link for ${recipe.name}`} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs" value={`${origin}/recipes/shared/${recipe.share_token}`} /></label><Button type="button" variant="secondary" onClick={() => { if (!navigator.clipboard) { setError("Select the link and copy it manually."); return; } void navigator.clipboard.writeText(`${window.location.origin}/recipes/shared/${recipe.share_token}`).then(() => setMessage("Share link copied."), () => setError("Could not copy. Select the link and copy it manually.")); }}>Copy link</Button><p className="text-xs text-[var(--muted)]">Shares the current name and configuration. Your account and build history stay private.</p></div>}
      </Card>;
    })}
  </div>;
}
