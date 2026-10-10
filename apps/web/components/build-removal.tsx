"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { removeBuilds } from "@/app/dashboard/build-actions";

export function BuildRemoval({ id, returnToHistory = false }: { id?: string; returnToHistory?: boolean }) {
  const [state, action, pending] = useActionState(removeBuilds, {});
  const router = useRouter();
  useEffect(() => {
    if (returnToHistory && state.deleted) router.replace("/dashboard");
  }, [returnToHistory, state.deleted, router]);

  return <form action={action} className="build-removal" onSubmit={event => {
    if (!window.confirm(id
      ? "Delete this build and its retained diagnostics from your history? Its download link will no longer be available."
      : "Clear all failed builds and their retained diagnostics from your history, including older pages?")) event.preventDefault();
  }}>
    <input type="hidden" name="mode" value={id ? "single" : "failed"} />
    {id && <input type="hidden" name="id" value={id} />}
    <button type="submit" className="row-action build-removal-button" disabled={pending} aria-label={id ? `Delete build ${id}` : undefined}>
      <Trash2 size={14} aria-hidden="true" />{pending ? "Removing…" : id ? "Delete" : "Clear failed builds"}
    </button>
    {state.error && <p role="alert">{state.error}</p>}
    {!id && state.message && <p role="status">{state.message}</p>}
  </form>;
}
