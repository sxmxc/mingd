"use client";
import { useActionState } from "react";
import { changeAccountAccess, updateSiteSettings } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
export function AccessForm({ id, role, enabled, self }: { id: string; role: string; enabled: boolean; self: boolean }) {
  const [state, action, pending] = useActionState(changeAccountAccess, {});
  return <form action={action} className="space-y-2"><input type="hidden" name="user_id" value={id} /><div className="flex flex-wrap items-center gap-3"><select aria-label="Account role" name="role" defaultValue={role} className="rounded border border-[var(--border)] bg-[var(--panel)] p-2" disabled={pending || self}><option value="authenticated">Authenticated</option><option value="superadmin">SuperAdmin</option></select><label className="flex gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={enabled} disabled={pending || self} />Enabled</label><Button type="submit" variant="secondary" disabled={pending || self}>{pending ? "Saving…" : self ? "Your account" : "Save access"}</Button></div>{state.error && <p role="alert" className="text-xs text-[var(--danger)]">{state.error}</p>}{state.message && <p role="status" className="text-xs text-[var(--success)]">{state.message}</p>}</form>;
}
export function SettingsForm({ enabled, announcement }: { enabled: boolean; announcement: string }) {
  const [state, action, pending] = useActionState(updateSiteSettings, {});
  return <form action={action} className="max-w-xl space-y-6"><label className="flex gap-3 text-sm"><input type="checkbox" name="build_submissions_enabled" defaultChecked={enabled} />Accept new build submissions</label><p className="text-sm text-[var(--muted)]">Pausing submissions leaves queued and running builds alone.</p><label className="block text-sm">Site announcement<textarea name="announcement" defaultValue={announcement} maxLength={500} rows={4} className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--panel)] p-3" /></label>{state.error && <p role="alert" className="text-sm text-[var(--danger)]">{state.error}</p>}{state.message && <p role="status" className="text-sm text-[var(--success)]">{state.message}</p>}<Button disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button></form>;
}
