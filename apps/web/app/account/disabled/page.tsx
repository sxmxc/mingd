import { redirect } from "next/navigation";
import { currentAccount } from "@/lib/access";
export default async function DisabledAccountPage() {
  const account = await currentAccount();
  if (!account) redirect("/login");
  if (account.enabled) redirect("/dashboard");
  return <main id="main-content" className="mx-auto max-w-md px-5 py-12"><h1 className="text-2xl font-semibold">Account suspended</h1><p className="mt-4 text-[var(--muted)]">An administrator has suspended access. Contact your site administrator to restore it.</p></main>;
}
