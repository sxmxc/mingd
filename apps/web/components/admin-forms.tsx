"use client";
import { useActionState, useState } from "react";
import { MAX_SITE_ANNOUNCEMENTS } from "@/lib/site-announcements";
import { changeAccountAccess, updateSiteSettings } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
export function AccessForm({ id, role, enabled, self }: { id: string; role: string; enabled: boolean; self: boolean }) {
  const [state, action, pending] = useActionState(changeAccountAccess, {});
  return <form action={action} className="space-y-2"><input type="hidden" name="user_id" value={id} /><div className="flex flex-wrap items-center gap-3"><select aria-label="Account role" name="role" defaultValue={role} className="rounded border border-[var(--border)] bg-[var(--panel)] p-2" disabled={pending || self}><option value="authenticated">Authenticated</option><option value="superadmin">SuperAdmin</option></select><label className="flex gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={enabled} disabled={pending || self} />Enabled</label><Button type="submit" variant="secondary" disabled={pending || self}>{pending ? "Saving…" : self ? "Your account" : "Save access"}</Button></div>{state.error && <p role="alert" className="text-xs text-[var(--danger)]">{state.error}</p>}{state.message && <p role="status" className="text-xs text-[var(--success)]">{state.message}</p>}</form>;
}
export function SettingsForm({ enabled, announcements }: { enabled: boolean; announcements: string[] }) {
  const [state, action, pending] = useActionState(updateSiteSettings, {});
  const [messages, setMessages] = useState(announcements.length ? announcements : [""]);
  return (
    <form action={action} className="max-w-xl space-y-6">
      <label className="flex gap-3 text-sm"><input type="checkbox" name="build_submissions_enabled" defaultChecked={enabled} disabled={pending} />Accept new build submissions</label>
      <p className="text-sm text-[var(--muted)]">Pausing submissions leaves queued and running builds alone.</p>
      <fieldset className="space-y-4" disabled={pending}>
        <legend className="mb-2 text-sm font-medium">Site announcements</legend>
        <p className="text-sm text-[var(--muted)]">Up to 10 announcements, 500 characters each. Users can collapse or dismiss them. Editing a message makes it appear again. Empty messages are removed when saved.</p>
        {messages.map((message, index) => (
          <div key={index} className="space-y-2">
            <label className="block text-sm">
              Announcement {index + 1}
              <textarea name="announcement" value={message} maxLength={500} rows={3}
                onChange={(event) => setMessages(messages.map((value, position) => position === index ? event.target.value : value))}
                className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--panel)] p-3" />
            </label>
            <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
              <span>{message.length}/500</span>
              <button type="button" className="secondary-action" aria-label={`Remove announcement ${index + 1}`} onClick={() => setMessages(messages.filter((_, position) => position !== index))}>Remove</button>
            </div>
          </div>
        ))}
        <Button type="button" variant="secondary" disabled={pending || messages.length >= MAX_SITE_ANNOUNCEMENTS} onClick={() => setMessages([...messages, ""])}>Add announcement</Button>
      </fieldset>
      {state.error && <p role="alert" className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-[var(--success)]">{state.message}</p>}
      <Button disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}
