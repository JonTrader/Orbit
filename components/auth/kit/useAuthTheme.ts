"use client";

import { useContext } from "react";

import { AuthThemeContext } from "./AuthThemeProvider";

export function useAuthTheme() {
  return useContext(AuthThemeContext);
}
