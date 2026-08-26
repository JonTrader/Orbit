"use client";

import type { InputHTMLAttributes } from "react";

import { useAuthTheme } from "./useAuthTheme";

const fieldInput = {
  pad: "rounded-sm border border-[color-mix(in_srgb,var(--auth-ink)_14%,transparent)] bg-white px-3 py-2.5 text-[1rem] outline-none focus:border-[var(--auth-clay)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--auth-clay)_18%,transparent)]",
  burner:
    "rounded-none border-0 border-b-[1.5px] border-[color-mix(in_srgb,var(--auth-ink)_18%,transparent)] bg-transparent px-0.5 py-2.5 text-[1rem] outline-none focus:border-[var(--auth-copper)]",
} as const;

function AuthFieldComponent({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const theme = useAuthTheme();

  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-(--auth-muted)">
        {label}
      </span>
      <input {...input} className={fieldInput[theme]} />
      {hint ? (
        <span className="text-[0.75rem] text-(--auth-muted)">{hint}</span>
      ) : null}
    </label>
  );
}

export const Field = AuthFieldComponent;
export const AuthField = AuthFieldComponent;
