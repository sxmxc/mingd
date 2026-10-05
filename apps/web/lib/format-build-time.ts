/** Stable across server/browser locales and timezones, including first hydration. */
export function formatBuildTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
