"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

export interface SidebarNavContextValue {
  openSidebar: () => void;
  closeSidebar: () => void;
}

export const SidebarNavContext =
  createContext<SidebarNavContextValue | null>(null);

/** Opens the mobile Spaces drawer; must be used under SpaceSidebarShell. */
export function useOpenSidebar(): () => void {
  const value = useContext(SidebarNavContext);
  if (!value) {
    throw new Error("useOpenSidebar must be used within SpaceSidebarShell");
  }
  return value.openSidebar;
}

export function SidebarNavProvider({
  value,
  children,
}: {
  value: SidebarNavContextValue;
  children: ReactNode;
}) {
  return (
    <SidebarNavContext.Provider value={value}>
      {children}
    </SidebarNavContext.Provider>
  );
}
