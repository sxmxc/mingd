import { env } from "@/lib/env";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { SavedRecipeInputSchema } from "@mingd/build-config";
import { currentAccount } from "@/lib/access";
import { recipeRequestAllowed } from "@/lib/recipe-request";
import { z } from "zod";

async function mutate(request: Request, context: { params: Promise<{ id: string }> }, remove: boolean) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!account.enabled) return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  if (!recipeRequestAllowed(request, env.configuredAppUrl())) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  let query;
  if (remove) query = account.supabase.from("saved_recipes").delete();
  else {
    const body = await request.json().catch(() => null);
    const sharing = z.object({ action: z.enum(["share", "stop-sharing"]) }).strict().safeParse(body);
    const recipe = SavedRecipeInputSchema.safeParse(body);
    if (!sharing.success && !recipe.success) return NextResponse.json({ error: "Invalid recipe update." }, { status: 400 });
    const update = sharing.success ? { share_token: sharing.data.action === "share" ? randomBytes(24).toString("base64url") : null } : recipe.data!;
    query = account.supabase.from("saved_recipes").update({ ...update, updated_at: new Date().toISOString() });
  }
  const { data, error } = await query.eq("id", id).eq("user_id", account.user.id).select("id,share_token").maybeSingle();
  if (error) return NextResponse.json({ error: "Recipe update failed." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  return NextResponse.json({ id: data.id, sharePath: data.share_token ? `/recipes/shared/${data.share_token}` : null });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return mutate(request, context, false); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return mutate(request, context, true); }
