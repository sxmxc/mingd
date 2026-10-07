"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { authenticate, type AuthState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type AuthMode = "signin" | "signup" | "reset" | "resend";
export function AuthForm({ initialMode = "signin", initialError, next = "/dashboard" }: { initialMode?: "signin" | "signup" | "reset"; initialError?: string; next?: string }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  return <AuthModeForm key={mode} mode={mode} setMode={setMode} next={next} initialError={mode === "signin" ? initialError : undefined} />;
}
function AuthModeForm({ mode, setMode, initialError, next }: { mode: AuthMode; setMode: (mode: AuthMode) => void; initialError?: string; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, {});
  const titles = { signin: "Sign in", signup: "Create an account", reset: "Reset your password", resend: "Confirm your email" };
  return <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6 sm:p-8">
    <h1 className="text-2xl font-semibold">{titles[mode]}</h1>
    <p className="mt-2 text-sm text-[var(--muted)]">{mode === "signin" ? "Access your builds and account." : mode === "signup" ? "Build custom Godot export templates." : "Enter your account email to receive a link."}</p>
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm">Email<Input className="mt-2" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      {(mode === "signin" || mode === "signup") && <label className="block text-sm">Password<Input className="mt-2" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} maxLength={128} /></label>}
      {(state.error || initialError) && <p role="alert" className="text-sm text-[var(--danger)]">{state.error ?? initialError}</p>}
      {state.message && <p role="status" className="text-sm text-[var(--success)]">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Please wait…" : mode === "reset" || mode === "resend" ? "Send email" : titles[mode]}</Button>
    </form>
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm text-[var(--muted)]">
      <button type="button" disabled={pending} onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create account" : "Back to sign in"}</button>
      {mode === "signin" && <><Link href="/forgot-password">Forgot password?</Link><button type="button" disabled={pending} onClick={() => setMode("resend")}>Resend confirmation</button></>}
    </div>
  </section>;
}
