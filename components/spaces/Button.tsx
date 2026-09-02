"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending: boolean;
  /** When set, replaces children while pending (e.g. "Saving…"). */
  pendingLabel?: string;
  children: ReactNode;
}

/**
 * Button for Space mutating actions. While pending, the label dims slightly
 * and a 2px accent line travels along the bottom edge.
 */
export function Button({
  pending,
  pendingLabel,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const label = pending && pendingLabel !== undefined ? pendingLabel : children;

  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-pending={pending ? "" : undefined}
      className={[
        className,
        "pending-underline relative overflow-hidden",
        pending ? "cursor-progress !opacity-100" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={pending ? "opacity-[0.72]" : undefined}>{label}</span>
    </button>
  );
}
