import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-[var(--border)] bg-[#0c1014] px-3 text-sm outline-none focus:border-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}
