import { requireAccount } from "@/lib/access";
import { gravatarUrl } from "@/lib/avatar";
import { AccountForm } from "@/components/account-form";
import { Card } from "@/components/ui/card";
export default async function AccountPage() {
  const { user, role } = await requireAccount();
  const name = typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : "";
  const avatarEnabled = user.user_metadata.avatar_enabled !== false;
  return <main id="main-content" className="mx-auto max-w-4xl px-5 py-10">
    <div className="mb-8 flex items-center gap-4">{avatarEnabled && user.email && <img src={gravatarUrl(user.email, 96)} width={64} height={64} alt="" referrerPolicy="no-referrer" className="rounded-full" />}<div><h1 className="text-3xl font-semibold">Account</h1><p className="mt-2 text-sm text-[var(--muted)]">{role === "superadmin" ? "SuperAdmin" : "Authenticated user"}</p></div></div>
    <div className="grid gap-6 md:grid-cols-2"><Card className="p-6"><h2 className="mb-5 text-lg font-semibold">Profile</h2><AccountForm kind="profile" name={name} avatarEnabled={avatarEnabled} /></Card><Card className="p-6"><h2 className="mb-5 text-lg font-semibold">Email</h2><AccountForm kind="email" email={user.email} /></Card><Card className="p-6 md:col-span-2"><h2 className="mb-5 text-lg font-semibold">Password</h2><div className="max-w-md"><AccountForm kind="password" /></div></Card></div>
  </main>;
}
