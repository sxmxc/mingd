"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function NavLink({ href, children, exact = false, className = "nav-link" }: { href: string; children: React.ReactNode; exact?: boolean; className?: string }) {
  const path = usePathname();
  const active = path === href || (!exact && path.startsWith(`${href}/`));
  return <Link href={href} className={`${className} ${active ? "text-[var(--accent-strong)]" : ""}`} aria-current={active ? "page" : undefined}>{children}</Link>;
}
