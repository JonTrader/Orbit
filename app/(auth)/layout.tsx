import type { ReactNode } from "react";

import { TimeZoneCookie } from "@/components/auth/TimeZoneCookie";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-104 flex-col justify-center px-4 py-10">
      <TimeZoneCookie />
      <div className="mb-5 px-1">
        <div className="text-[1.35rem] font-bold tracking-[-0.03em]">
          Or<span className="text-accent">bit</span>
        </div>
        <div className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
          Household agenda
        </div>
      </div>
      {children}
    </div>
  );
}
