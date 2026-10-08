"use server";
import { env } from "@/lib/env";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccount } from "@/lib/access";
import type { AuthState } from "@/app/auth/actions";
export async function updateAccount(_previous: AuthState, form: FormData): Promise<AuthState> {
  const { user, supabase } = await requireAccount();
  const kind = form.get("kind");
  if (kind === "profile") {
    const name = z.string().trim().max(80).safeParse(form.get("display_name"));
    if (!name.success) return { error: "Display names can have at most 80 characters." };
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.data, avatar_enabled: form.get("avatar_enabled") === "on" } });
    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { message: "Profile saved." };
  }
  if (kind === "email") {
    const email = z.email().max(254).safeParse(String(form.get("email") ?? "").trim());
    if (!email.success) return { error: "Enter a valid email address." };
    const { error } = await supabase.auth.updateUser({ email: email.data }, { emailRedirectTo: `${env.appUrl()}/auth/callback` });
    return error ? { error: error.message } : { message: "Check your email to confirm the address change." };
  }
  if (kind === "password" || kind === "recovery") {
    const password = z.string().min(8).max(128).safeParse(form.get("password"));
    if (!password.success) return { error: "Use a password between 8 and 128 characters." };
    if (password.data !== form.get("confirm_password")) return { error: "The passwords do not match." };
    if (kind === "password") {
      const current = String(form.get("current_password") ?? "");
      if (!user.email || !current) return { error: "Enter your current password." };
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (error) return { error: "Your current password is incorrect." };
    }
    const { error } = await supabase.auth.updateUser({ password: password.data });
    return error ? { error: error.message } : { message: "Password updated. You can now sign in with it." };
  }
  return { error: "Invalid request." };
}
