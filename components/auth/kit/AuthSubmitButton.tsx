"use client";

import type { ReactNode } from "react";

import { useAuthTheme } from "./useAuthTheme";
import { AuthPendingMark } from "./AuthPendingMark";

const submitBtn = {
  pad: "mt-1 inline-flex w-fit items-center justify-center gap-2 rounded-none bg-[var(--auth-ink)] px-4 py-2.5 text-[0.92rem] font-bold text-[#f4f1ea] disabled:cursor-wait disabled:opacity-60",
  burner:
    "mt-1 inline-flex w-full items-center justify-center gap-2 rounded-none bg-[var(--auth-ink)] px-4 py-3 text-[0.92rem] font-bold text-[var(--auth-butcher)] disabled:cursor-wait disabled:opacity-60",
} as const;

function AuthSubmitButtonComponent({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  const theme = useAuthTheme();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={submitBtn[theme]}
    >
      {pending ? (
        <>
          <AuthPendingMark />
          <span className="opacity-90">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export const SubmitButton = AuthSubmitButtonComponent;
export const AuthSubmitButton = AuthSubmitButtonComponent;
