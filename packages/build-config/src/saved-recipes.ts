import { z } from "zod";
import { assertRealBuildSupported } from "./scons.ts";

export const SavedRecipeInputSchema = z.object({
  name: z.string().trim().min(1, "Name your recipe.").max(80),
  config: z.unknown().transform((value, ctx) => {
    try { return assertRealBuildSupported(value); }
    catch { ctx.addIssue({ code: "custom", message: "Invalid or unsupported recipe configuration." }); return z.NEVER; }
  }),
}).strict();

export type SavedRecipeInput = z.infer<typeof SavedRecipeInputSchema>;
