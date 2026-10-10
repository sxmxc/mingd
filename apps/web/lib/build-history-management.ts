import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const BUILD_HISTORY_PAGE_SIZE = 50;

export function buildHistoryPage(value: string | string[] | undefined) {
  const page = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(page) && page <= 1_000_000 ? page : 1;
}

export type BuildRemovalResult = { error?: string; message?: string; deleted?: number };

export async function removeOwnedBuilds(supabase: SupabaseClient, userId: string, input: { mode: unknown; id: unknown }): Promise<BuildRemovalResult> {
  if (input.mode !== "single" && input.mode !== "failed") return { error: "Invalid cleanup request." };
  if (input.mode === "single" && !z.uuid().safeParse(input.id).success) return { error: "Invalid build ID." };

  let query = supabase.from("builds").delete({ count: "exact" }).eq("user_id", userId);
  query = input.mode === "failed"
    ? query.eq("status", "failed")
    : query.eq("id", input.id as string).in("status", ["complete", "failed"]);
  const { error, count } = await query;
  if (error) return { error: "Could not remove builds. Try again." };
  if (!count && input.mode === "single") return { error: "Build not found or still active. Refresh and try again." };
  return { deleted: count ?? 0, message: input.mode === "single" ? "Build deleted." : `${count ?? 0} failed builds cleared.` };
}
