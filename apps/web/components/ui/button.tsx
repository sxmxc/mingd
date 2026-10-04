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
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "default" && "bg-[var(--accent)] text-[#07111b] hover:bg-[var(--accent-strong)]",
        variant === "secondary" && "border border-[var(--border)] bg-[var(--panel-2)] hover:bg-[#202832]",
        variant === "ghost" && "hover:bg-[var(--panel-2)]",
        variant === "danger" && "bg-[var(--danger)] text-[#190808]",
        className,
      )}
      {...props}
    />
  );
}
