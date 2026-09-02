"use client";

import type { ReactNode } from "react";

import type { SpaceNavItem } from "@/lib/spaces/nav";

import { SidebarFooter, type SidebarFooterUser } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarNavLinks } from "./SidebarNavLinks";

interface SpaceSidebarProps {
  user?: SidebarFooterUser;
  canChangePassword?: boolean;
  /** Server-rendered streamed slot; see SidebarSpaces. */
  spacesSlot?: ReactNode;
  navItems: SpaceNavItem[];
  onNavClick?: () => void;
}

export function SpaceSidebar({
  user,
  canChangePassword,
  spacesSlot,
  navItems,
  onNavClick,
}: SpaceSidebarProps) {
  return (
    <aside
      className="flex h-full flex-col gap-5 overflow-auto border-r border-line bg-[color-mix(in_srgb,var(--sidebar)_88%,white)] px-3.5 py-5"
      aria-label="Spaces and sections"
    >
      <SidebarHeader />
      {/* Clicks bubble up from the slot's links; the slot itself is a server
          component and cannot receive the onNavClick handler directly. */}
      <div onClick={onNavClick}>{spacesSlot}</div>
      <SidebarNavLinks
        title="In this Space"
        items={navItems}
        onClick={onNavClick}
      />
      <SidebarFooter user={user} canChangePassword={canChangePassword} />
    </aside>
  );
}
