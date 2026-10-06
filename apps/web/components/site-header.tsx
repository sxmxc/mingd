import Link from "next/link";
import { currentAccount } from "@/lib/access";
import { gravatarUrl } from "@/lib/avatar";
import { HeaderNavigation } from "@/components/header-navigation";

export async function SiteHeader() {
  const account = await currentAccount();
  const settings = account?.enabled ? await account.supabase.from("site_settings").select("announcement").eq("id", true).maybeSingle() : null;

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="site-header-inner">
        <Link href="/" className="header-brand">
          <span className="font-mono text-xl" aria-label="min.gd">min<span className="text-[var(--accent)]">.</span>gd</span>
        </Link>
        <HeaderNavigation account={account ? {
          name: [account.user.user_metadata.display_name, account.user.user_metadata.username, account.user.email]
            .find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "Your account",
          email: account.user.email ?? "",
          avatar: account.user.email && account.user.user_metadata.avatar_enabled !== false ? gravatarUrl(account.user.email, 64) : null,
          enabled: account.enabled,
          admin: account.role === "superadmin",
        } : null} />
      </div>
      {settings?.data?.announcement && <div className="header-announcement"><p role="status">{settings.data.announcement}</p></div>}
    </header>
  );
}
