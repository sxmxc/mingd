"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10000); return () => clearInterval(timer); }, [router]);
  return <span className="text-xs text-[var(--muted)]">Refreshes every 10 seconds</span>;
}
