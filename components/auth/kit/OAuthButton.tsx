"use client";

import type { AuthTheme } from "./AuthThemeProvider";

const oauthBtn = {
  pad: "flex items-center justify-center gap-2 rounded-sm border border-[color-mix(in_srgb,var(--auth-ink)_14%,transparent)] bg-white px-4 py-2.5 text-[0.9rem] font-semibold hover:border-[color-mix(in_srgb,var(--auth-ink)_28%,transparent)] disabled:cursor-wait",
  burner:
    "flex items-center justify-center gap-2 border border-[color-mix(in_srgb,var(--auth-ink)_16%,transparent)] bg-transparent px-4 py-2.5 text-[0.88rem] font-semibold hover:border-[color-mix(in_srgb,var(--auth-ink)_28%,transparent)] disabled:cursor-wait",
} as const;

export function oauthButtonClass(theme: AuthTheme) {
  return oauthBtn[theme];
}
