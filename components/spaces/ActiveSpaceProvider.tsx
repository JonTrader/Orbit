"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ActiveSpace } from "@/lib/spaces/active-space";

export const ActiveSpaceContext = createContext<ActiveSpace | null>(null);

export function ActiveSpaceProvider({
  value,
  children,
}: {
  value: ActiveSpace;
  children: ReactNode;
}) {
  return (
    <ActiveSpaceContext.Provider value={value}>
      {children}
    </ActiveSpaceContext.Provider>
  );
}

export function useActiveSpace(): ActiveSpace {
  const value = useContext(ActiveSpaceContext);
  if (!value) {
    throw new Error("useActiveSpace must be used within ActiveSpaceProvider");
  }
  return value;
}
