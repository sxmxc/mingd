"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true); setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage(error.message);
    router.push("/dashboard"); router.refresh();
  }

  async function signUp() {
    setBusy(true); setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage("Account created. If email confirmation is enabled, confirm it before signing in.");
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <Card className="p-6">
        <p className="section-label">Template workbench / access</p>
        <h1 className="mt-3 text-2xl font-semibold">Open your workspace</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Sign in to configure templates and inspect your build artifacts.</p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm"><span className="mb-2 block">Email</span><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="block text-sm"><span className="mb-2 block">Password</span><Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {message && <p className="rounded-md border border-[var(--border)] bg-[#0c1014] p-3 text-sm text-[var(--muted)]">{message}</p>}
          <div className="flex gap-3">
            <Button onClick={signIn} disabled={busy || !email || !password}>Sign in</Button>
            <Button variant="secondary" onClick={signUp} disabled={busy || !email || password.length < 8}>Create account</Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
