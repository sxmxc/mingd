"use server";

import { revalidatePath } from "next/cache";
import { currentAccount } from "@/lib/access";
import { removeOwnedBuilds, type BuildRemovalResult } from "@/lib/build-history-management";

export async function removeBuilds(_previous: BuildRemovalResult, formData: FormData): Promise<BuildRemovalResult> {
  const account = await currentAccount();
  if (!account) return { error: "Sign in to manage your builds." };
  if (!account.enabled) return { error: "Account suspended." };
  const result = await removeOwnedBuilds(account.supabase, account.user.id, { mode: formData.get("mode"), id: formData.get("id") });
  if (!result.error) revalidatePath("/dashboard");
  return result;
}
