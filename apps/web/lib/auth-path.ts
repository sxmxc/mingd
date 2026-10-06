export function safeAuthNext(value: string | null): string {
  return value === "/account/reset-password" ? value : "/dashboard";
}
