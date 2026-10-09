"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { BookOpen, ChevronDown, List, LogOut, Plus, UserRound } from "lucide-react";
import { signOut } from "@/app/dashboard/actions";
import { NavLink } from "@/components/nav-link";

type HeaderAccount = { name: string; email: string; avatar: string | null; enabled: boolean; admin: boolean };

function SignOutButton() {
  const { pending } = useFormStatus();
  return <button className="account-menu-item" type="submit" disabled={pending}><LogOut size={16} aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}</button>;
}

function HeaderDropdown({ label, accessibleLabel, children, active = false, account = false }: { label: React.ReactNode; accessibleLabel: string; children: React.ReactNode; active?: boolean; account?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  return <div className={`header-dropdown ${account ? "header-account" : "header-builds"}`} ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} className={account ? "header-account-trigger" : "header-nav-link header-dropdown-trigger"} type="button" data-active={active || undefined} aria-label={accessibleLabel} aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
      {label}{!account && <ChevronDown size={14} aria-hidden="true" />}
    </button>
    {open && <div id={menuId} className="header-dropdown-panel" onClick={event => { if ((event.target as Element).closest("a")) setOpen(false); }}>{children}</div>}
  </div>;
}

export function HeaderNavigation({ account }: { account: HeaderAccount | null }) {
  const path = usePathname();
  return <>
    {account?.enabled && <nav aria-label="Main navigation" className="header-primary-nav">
      <HeaderDropdown label="Builds" accessibleLabel="Builds menu" active={path === "/dashboard" || path.startsWith("/build/") || path === "/recipes"}>
        <nav aria-label="Build navigation">
          <Link href="/dashboard" className="account-menu-item" aria-current={path === "/dashboard" ? "page" : undefined}><List size={16} aria-hidden="true" />All builds</Link>
          <Link href="/build/new" className="account-menu-item" aria-current={path === "/build/new" ? "page" : undefined}><Plus size={16} aria-hidden="true" />New build</Link>
          <Link href="/recipes" className="account-menu-item" aria-current={path === "/recipes" ? "page" : undefined}><List size={16} aria-hidden="true" />Saved recipes</Link>
        </nav>
      </HeaderDropdown>
      {account.admin && <NavLink href="/admin" className="header-nav-link">Admin</NavLink>}
    </nav>}
    <div className="header-actions">
      <nav aria-label="Project resources" className="header-resource-links">
        <a href="https://github.com/sxmxc/mingd" className="header-icon-link" aria-label="GitHub repository" title="GitHub repository" target="_blank" rel="noopener noreferrer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297a12 12 0 0 0-3.793 23.385c.6.111.82-.261.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.304-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 6.006 0c2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.119 3.176.77.84 1.235 1.91 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.216.694.825.576A12 12 0 0 0 12 .297Z" /></svg>
        </a>
        <a href="https://sxmxc.github.io/mingd/" className="header-icon-link" aria-label="Documentation" title="Documentation" target="_blank" rel="noopener noreferrer"><BookOpen size={20} aria-hidden="true" /></a>
      </nav>
      {account ? <HeaderDropdown account accessibleLabel={`Account menu for ${account.name}`} label={<>
        {account.avatar ? <img src={account.avatar} width={30} height={30} alt="" referrerPolicy="no-referrer" /> : <span className="header-avatar-fallback"><UserRound size={17} aria-hidden="true" /></span>}
      </>}>
        <div className="account-menu-identity"><p>{account.name}</p>{account.email !== account.name && <span>{account.email}</span>}</div>
        <nav aria-label="Account navigation">
          {account.enabled && <Link href="/account" className="account-menu-item"><UserRound size={16} aria-hidden="true" />Account settings</Link>}
          <form action={signOut}><SignOutButton /></form>
        </nav>
      </HeaderDropdown> : <Link href="/login" className="header-sign-in">Sign in</Link>}
    </div>
  </>;
}
