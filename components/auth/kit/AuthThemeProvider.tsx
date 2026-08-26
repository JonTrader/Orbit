"use client";

import { createContext, type ReactNode } from "react";

export type AuthTheme = "pad" | "burner";

export const AuthThemeContext = createContext<AuthTheme>("pad");

export function AuthThemeProvider({
  theme,
  children,
}: {
  theme: AuthTheme;
  children: ReactNode;
}) {
  return (
    <AuthThemeContext.Provider value={theme}>{children}</AuthThemeContext.Provider>
  );
}
