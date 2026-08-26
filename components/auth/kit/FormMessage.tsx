"use client";

import type { ReactNode } from "react";

import { useAuthTheme } from "./useAuthTheme";

export function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  const theme = useAuthTheme();
  const styles =
    tone === "info"
      ? "border-[color-mix(in_srgb,#0f766e_40%,transparent)] bg-[color-mix(in_srgb,#0f766e_8%,transparent)] text-[#0f766e]"
      : theme === "pad"
        ? "border-[color-mix(in_srgb,var(--auth-clay)_40%,transparent)] bg-[color-mix(in_srgb,var(--auth-clay)_8%,transparent)] text-[var(--auth-clay)]"
        : "border-[color-mix(in_srgb,var(--auth-copper)_40%,transparent)] bg-[color-mix(in_srgb,var(--auth-copper)_8%,transparent)] text-[var(--auth-copper)]";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-sm border px-3 py-2 text-[0.85rem] ${styles}`}
    >
      {children}
    </p>
  );
}
