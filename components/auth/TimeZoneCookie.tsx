"use client";

import { useEffect } from "react";

import { TIMEZONE_COOKIE } from "@/lib/timezone";

const SAFE_ZONE = /^[A-Za-z0-9_+\-/]+$/;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Records the browser zone so the first authenticated request can stamp it on
 * the Personal Space it creates (ADR 0003). Rendered on the auth pages, which
 * every new user passes through before the app shell.
 */
export function TimeZoneCookie() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || !SAFE_ZONE.test(zone)) return;
    document.cookie = `${TIMEZONE_COOKIE}=${zone}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }, []);

  return null;
}
