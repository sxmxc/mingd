"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type Build = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  error: string | null;
  log_tail: string | null;
  config: Record<string, unknown>;
  artifact_id: string | null;
};

export function BuildStatus({ initial }: { initial: Build }) {
  const [build, setBuild] = useState(initial);

  useEffect(() => {
    if (build.status === "complete" || build.status === "failed") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/builds/${build.id}`, { cache: "no-store" });
      if (response.ok) setBuild(await response.json());
    }, 2000);
    return () => clearInterval(timer);
  }, [build.id, build.status]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--muted)]">{build.status}</p><h2 className="mt-2 text-xl font-bold">{build.stage}</h2></div><span className="font-mono text-2xl">{build.progress}%</span></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#06080a]"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${build.progress}%` }} /></div>
      {build.error && <div className="mt-5 rounded-md border border-[#5c3030] bg-[#211010] p-4 text-sm text-[#ffb2b2]">{build.error}</div>}
      {build.log_tail && <details className="mt-5"><summary className="cursor-pointer text-sm text-[var(--muted)]">Compiler log tail</summary><pre className="mt-3 max-h-80 overflow-auto rounded-md border border-[var(--border)] bg-[#07090c] p-4 text-xs leading-5">{build.log_tail}</pre></details>}
      {build.status === "complete" && <a href={`/api/builds/${build.id}/download`} className="mt-6 inline-flex rounded-md bg-[var(--accent)] px-4 py-2 font-bold text-[#07111b]">Download .tpz</a>}
    </Card>
  );
}
