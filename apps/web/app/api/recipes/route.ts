import { NextResponse } from "next/server";
import { SavedRecipeInputSchema } from "@mingd/build-config";
import { currentAccount } from "@/lib/access";
import { recipeRequestAllowed } from "@/lib/recipe-request";

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Sign in to save recipes." }, { status: 401 });
  if (!account.enabled) return NextResponse.json({ error: "Account suspended." }, { status: 403 });
  if (!recipeRequestAllowed(request, process.env.NEXT_PUBLIC_APP_URL)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const input = SavedRecipeInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Invalid recipe." }, { status: 400 });
  const { data, error } = await account.supabase.from("saved_recipes").insert({ ...input.data, user_id: account.user.id }).select("id").single();
  if (error) return NextResponse.json({ error: "Recipe could not be saved." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
