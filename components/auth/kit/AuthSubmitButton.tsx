"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/spaces/Button";

import { useAuthTheme } from "./useAuthTheme";

const submitBtn = {
  pad: "mt-1 inline-flex w-fit items-center justify-center rounded-none bg-[var(--auth-ink)] px-4 py-2.5 text-[0.92rem] font-bold text-[#f4f1ea]",
  burner:
    "mt-1 inline-flex w-full items-center justify-center rounded-none bg-[var(--auth-ink)] px-4 py-3 text-[0.92rem] font-bold text-[var(--auth-butcher)]",
} as const;

function AuthSubmitButtonComponent({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel?: string;
  children: ReactNode;
}) {
  const theme = useAuthTheme();

  return (
    <Button
      type="submit"
      pending={pending}
      pendingLabel={pendingLabel}
      className={submitBtn[theme]}
    >
      {children}
    </Button>
  );
}

export const SubmitButton = AuthSubmitButtonComponent;
export const AuthSubmitButton = AuthSubmitButtonComponent;
