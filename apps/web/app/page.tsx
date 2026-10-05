import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");
  return <main className="mx-auto max-w-5xl px-5 py-16"><p className="section-label">Godot / export template workbench</p><h1 className="mt-4 text-3xl font-semibold">Configure. Compile. Export.</h1><p className="mt-4 max-w-2xl leading-7 text-[var(--muted)]">Build reproducible desktop templates from verified official Godot source. Choose a target and engine profile, inspect compiler activity, and download your template package.</p><div className="mt-8 grid gap-4 sm:grid-cols-3">{[["01 / Configure", "Linux or Windows x86_64. Standard or Lean 2D. Godot 4.7.2."], ["02 / Monitor", "Worker heartbeats, elapsed time, stage transitions, and live compiler output."], ["03 / Export", "Private .tpz artifacts. Install in Godot, then smoke-test your exported game."]].map(([title,body]) => <Card key={title} className="p-5"><h2 className="font-mono text-sm">{title}</h2><p className="mt-4 text-sm leading-6 text-[var(--muted)]">{body}</p></Card>)}</div><Link className="tool-action mt-8 inline-flex" href="/login">Sign in to open workbench →</Link></main>;
}
