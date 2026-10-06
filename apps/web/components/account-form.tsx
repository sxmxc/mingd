"use client";
import { useActionState } from "react";
import { updateAccount } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function AccountForm({ kind, email = "", name = "", avatarEnabled = true }: { kind: "profile" | "email" | "password" | "recovery"; email?: string; name?: string; avatarEnabled?: boolean }) {
  const [state, action, pending] = useActionState(updateAccount, {});
  return <form action={action} className="space-y-5">
    <input type="hidden" name="kind" value={kind} />
    {kind === "profile" && <><label className="block text-sm">Display name<Input className="mt-2" name="display_name" defaultValue={name} maxLength={80} autoComplete="nickname" /></label><label className="flex items-center gap-3 text-sm"><input type="checkbox" name="avatar_enabled" defaultChecked={avatarEnabled} />Use my Gravatar</label><p className="text-sm text-[var(--muted)]">Your picture comes from the Gravatar linked to your account email. <a className="underline" href="https://gravatar.com/" target="_blank" rel="noreferrer">Edit it on Gravatar</a>.</p></>}
    {kind === "email" && <label className="block text-sm">Email address<Input className="mt-2" name="email" type="email" defaultValue={email} required maxLength={254} autoComplete="email" /></label>}
    {kind === "password" && <label className="block text-sm">Current password<Input className="mt-2" name="current_password" type="password" required autoComplete="current-password" maxLength={128} /></label>}
    {(kind === "password" || kind === "recovery") && <><label className="block text-sm">New password<Input className="mt-2" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label><label className="block text-sm">Confirm new password<Input className="mt-2" name="confirm_password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label></>}
    {state.error && <p role="alert" className="text-sm text-[var(--danger)]">{state.error}</p>}
    {state.message && <p role="status" className="text-sm text-[var(--success)]">{state.message}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : kind === "profile" ? "Save profile" : kind === "email" ? "Change email" : "Update password"}</Button>
  </form>;
}
