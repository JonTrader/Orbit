"use client";

import type { ReactNode } from "react";

import { useAuthTheme } from "./useAuthTheme";

export function AuthHeading({
  title,
  intro,
}: {
  title: string;
  intro?: ReactNode;
}) {
  const theme = useAuthTheme();
  const titleClass = "text-[1.85rem] font-bold tracking-[-0.03em] leading-tight";

  return (
    <header>
      <h1 className={titleClass}>{title}</h1>
      {intro ? (
        <p
          className={[
            "mt-1.5 text-[0.95rem] leading-relaxed",
            theme === "pad"
              ? "max-w-88 text-var(--auth-muted)"
              : "text-[color-mix(in_srgb,var(--auth-ink)_62%,var(--auth-ash))]",
          ].join(" ")}
        >
          {intro}
        </p>
      ) : null}
    </header>
  );
}
