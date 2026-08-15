"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AuthTheme = "pad" | "burner";

const AuthThemeContext = createContext<AuthTheme>("pad");

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

export function useAuthTheme() {
  return useContext(AuthThemeContext);
}
