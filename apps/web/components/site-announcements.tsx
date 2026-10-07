"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { ANNOUNCEMENT_STORAGE_KEY, readAnnouncementPreferences, type AnnouncementPreferences } from "@/lib/site-announcements";

export function SiteAnnouncements({ announcements }: { announcements: string[] }) {
  const panelId = useId();
  const [preferences, setPreferences] = useState<AnnouncementPreferences | null>(null);

  useEffect(() => {
    function load() {
      try { setPreferences(readAnnouncementPreferences(localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY))); }
      catch { setPreferences({ dismissed: [], collapsed: [] }); }
    }
    load();
    function sync(event: StorageEvent) {
      if (event.key === ANNOUNCEMENT_STORAGE_KEY || event.key === null) load();
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function save(next: AnnouncementPreferences) {
    setPreferences(next);
    try { localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* Controls still work when browser storage is unavailable. */ }
  }

  if (!announcements.length) return null;
  const current = preferences ?? { dismissed: [], collapsed: [] };
  const visible = announcements.filter((message) => !current.dismissed.includes(message));
  const expanded = preferences !== null && visible.some((message) => !current.collapsed.includes(message));
  const hiddenCount = announcements.length - visible.length;

  function toggle() {
    save({ ...current, collapsed: expanded
      ? [...new Set([...current.collapsed, ...visible])].slice(-100)
      : current.collapsed.filter((message) => !visible.includes(message)) });
  }

  return (
    <section className="header-announcements" aria-label="Site announcements">
      <div className="announcements-inner">
        <div className="announcements-toolbar">
          <button type="button" className="announcements-toggle" aria-expanded={expanded} aria-controls={panelId}
            onClick={visible.length ? toggle : () => save({ dismissed: [], collapsed: [] })}>
            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            Announcements <span className="announcements-count">{visible.length || announcements.length}</span>
            {!visible.length && <span className="text-[var(--muted)]">· all dismissed</span>}
          </button>
          <div className="announcements-actions">
            {hiddenCount > 0 && visible.length > 0 && <button type="button" onClick={() => save({ dismissed: [], collapsed: [] })}>Show dismissed ({hiddenCount})</button>}
            {visible.length > 0 && <button type="button" onClick={() => save({ ...current, dismissed: [...new Set([...current.dismissed, ...announcements])].slice(-100) })}>Dismiss all</button>}
          </div>
        </div>
        <ul id={panelId} hidden={!expanded} className="announcements-list">
          {visible.map((message, index) => (
            <li key={message} className="announcement-row">
              <p>{message}</p>
              <button type="button" className="announcement-dismiss" aria-label={`Dismiss announcement ${index + 1}`} title="Dismiss announcement"
                onClick={() => save({ ...current, dismissed: [...current.dismissed, message].slice(-100) })}>
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
