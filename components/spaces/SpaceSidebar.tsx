"use client";

import type { ReactNode } from "react";

import { SidebarFooter, type SidebarFooterUser } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";

interface SpaceSidebarProps {
  user?: SidebarFooterUser;
  canChangePassword?: boolean;
  /** Server-rendered streamed slot; see SidebarSpaces. */
  spacesSlot?: ReactNode;
  onNavClick?: () => void;
}

export function SpaceSidebar({
  user,
  canChangePassword,
  spacesSlot,
  onNavClick,
}: SpaceSidebarProps) {
  return (
    <aside
      className="flex h-full flex-col gap-1 overflow-auto border-r border-line bg-[color-mix(in_srgb,var(--sidebar)_88%,white)] px-3.5 py-5"
      aria-label="Spaces"
    >
      <SidebarHeader />
      {/* Clicks bubble up from the slot's links; the slot itself is a server
          component and cannot receive the onNavClick handler directly. */}
      <div className="flex min-h-0 flex-1 flex-col" onClick={onNavClick}>
        {spacesSlot}
      </div>
      <SidebarFooter user={user} canChangePassword={canChangePassword} />
    </aside>
  );
}
