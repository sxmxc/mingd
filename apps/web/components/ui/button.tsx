import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "default" && "bg-[var(--accent)] text-[#06121d] hover:bg-[var(--accent-strong)]",
        variant === "secondary" && "border border-[var(--border)] bg-[var(--panel-2)] hover:bg-[#202b36]",
        variant === "ghost" && "hover:bg-[var(--panel-2)]",
        variant === "danger" && "bg-[var(--danger)] text-[#190808]",
        className,
      )}
      {...props}
    />
  );
}
