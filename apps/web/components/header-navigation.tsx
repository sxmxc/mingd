"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, List, LogOut, Plus, UserRound } from "lucide-react";
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
      <HeaderDropdown label="Builds" accessibleLabel="Builds menu" active={path === "/dashboard" || path.startsWith("/build/")}>
        <nav aria-label="Build navigation">
          <Link href="/dashboard" className="account-menu-item" aria-current={path === "/dashboard" ? "page" : undefined}><List size={16} aria-hidden="true" />All builds</Link>
          <Link href="/build/new" className="account-menu-item" aria-current={path === "/build/new" ? "page" : undefined}><Plus size={16} aria-hidden="true" />New build</Link>
        </nav>
      </HeaderDropdown>
      {account.admin && <NavLink href="/admin" className="header-nav-link">Admin</NavLink>}
    </nav>}
    <div className="header-actions">
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
