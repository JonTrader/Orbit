import type { Metadata } from "next";
import type { ReactNode } from "react";

import { TimeZoneCookie } from "@/components/auth/TimeZoneCookie";

export const metadata: Metadata = {
  referrer: "no-referrer",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TimeZoneCookie />
      {children}
    </>
  );
}
