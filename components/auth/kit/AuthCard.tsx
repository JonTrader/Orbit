"use client";

import type { ReactNode } from "react";

import { AuthHeading } from "./AuthHeading";

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <AuthHeading title={title} intro={intro} />
      <div className="mt-5">{children}</div>
      {footer ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[0.88rem] text-(--auth-muted)">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
