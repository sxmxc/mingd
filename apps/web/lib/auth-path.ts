export function safeAuthNext(value: string | null): string {
  if (value === "/account/reset-password" || value === "/recipes") return value;
  if (value && /^\/build\/new\?(?:share=[A-Za-z0-9_-]{32}|(?:recipe|build)=[a-f0-9-]{36})$/.test(value)) return value;
  return "/dashboard";
}
