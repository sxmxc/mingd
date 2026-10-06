"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
export type AuthState = { error?: string; message?: string };
const emailSchema = z.email().max(254);
function callback(next = "/dashboard") {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent(next)}`;
}
export async function authenticate(_previous: AuthState, form: FormData): Promise<AuthState> {
  const mode = form.get("mode");
  const email = emailSchema.safeParse(String(form.get("email") ?? "").trim());
  const password = String(form.get("password") ?? "");
  if (!email.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  if (mode === "reset") {
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: callback("/account/reset-password") });
    return error ? { error: error.message } : { message: "If an account uses this address, you’ll receive a password reset link." };
  }
  if (mode === "resend") {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.data, options: { emailRedirectTo: callback() } });
    return error ? { error: error.message } : { message: "Check your inbox for a confirmation link." };
  }
  if (mode !== "signin" && mode !== "signup") return { error: "Invalid request." };
  if (!password || password.length > 128 || (mode === "signup" && password.length < 8)) return { error: "Use a password between 8 and 128 characters." };
  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp({ email: email.data, password, options: { emailRedirectTo: callback() } });
    if (error) return { error: error.message };
    if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
    if (error) return { error: error.message };
  }
  redirect("/dashboard");
}
