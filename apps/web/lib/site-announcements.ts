import { z } from "zod";

export const MAX_SITE_ANNOUNCEMENTS = 10;
export const siteAnnouncementsSchema = z.array(z.string().trim().max(500))
  .max(MAX_SITE_ANNOUNCEMENTS)
  .transform((messages) => [...new Set(messages.filter(Boolean))]);

export const ANNOUNCEMENT_STORAGE_KEY = "mingd:announcements:v1";
export type AnnouncementPreferences = { dismissed: string[]; collapsed: string[] };

export function readAnnouncementPreferences(value: string | null): AnnouncementPreferences {
  try {
    const parsed = JSON.parse(value ?? "null");
    const result = z.object({
      dismissed: z.array(z.string()).max(100),
      collapsed: z.array(z.string()).max(100),
    }).safeParse(parsed);
    if (result.success) return result.data;
  } catch { /* Ignore unavailable or malformed browser storage. */ }
  return { dismissed: [], collapsed: [] };
}
