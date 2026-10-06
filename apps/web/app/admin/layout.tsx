import { NavLink } from "@/components/nav-link";
import { requireSuperAdmin } from "@/lib/access";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return <main id="main-content" className="mx-auto max-w-7xl px-5 py-10"><h1 className="text-3xl font-semibold">Administration</h1><nav aria-label="Administration" className="my-6 flex flex-wrap gap-6 border-b border-[var(--border)] pb-4 text-sm"><NavLink href="/admin" exact>Build tasks</NavLink><NavLink href="/admin/users">Users</NavLink><NavLink href="/admin/metrics">Metrics</NavLink><NavLink href="/admin/settings">Settings</NavLink></nav>{children}</main>;
}
