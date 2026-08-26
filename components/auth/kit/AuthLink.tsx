"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useAuthTheme } from "./useAuthTheme";

const accentLink = {
  pad: "font-bold text-[var(--auth-clay)] hover:underline",
  burner: "font-bold text-[var(--auth-copper)] hover:underline",
} as const;

const mutedLink = {
  pad: "font-medium text-[var(--auth-muted)] hover:text-[var(--auth-ink)]",
  burner:
    "font-medium text-[color-mix(in_srgb,var(--auth-ink)_55%,var(--auth-ash))] hover:text-[var(--auth-ink)]",
} as const;

export function AuthLink({
  href,
  tone = "accent",
  children,
}: {
  href: string;
  tone?: "accent" | "muted";
  children: ReactNode;
}) {
  const theme = useAuthTheme();
  const className = tone === "accent" ? accentLink[theme] : mutedLink[theme];

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
