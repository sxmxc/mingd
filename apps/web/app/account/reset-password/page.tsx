import Link from "next/link";
import { requireAccount } from "@/lib/access";
import { AccountForm } from "@/components/account-form";
import { Card } from "@/components/ui/card";
export default async function ResetPasswordPage() {
  await requireAccount();
  return <main id="main-content" className="mx-auto max-w-md px-5 py-12"><Card className="p-6"><h1 className="mb-6 text-2xl font-semibold">Set a new password</h1><AccountForm kind="recovery" /><Link href="/account" className="mt-6 block text-sm text-[var(--muted)]">Back to account</Link></Card></main>;
}
