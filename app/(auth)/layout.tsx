import type { ReactNode } from "react";

import { TimeZoneCookie } from "@/components/auth/TimeZoneCookie";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TimeZoneCookie />
      {children}
    </>
  );
}
