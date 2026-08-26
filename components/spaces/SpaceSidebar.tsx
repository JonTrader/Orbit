"use client";

import type { SpaceNavItem } from "@/lib/spaces/nav";
import { spaceSectionPath } from "@/lib/spaces/paths";

import { SidebarFooter, type SidebarFooterUser } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarNavLinks } from "./SidebarNavLinks";

interface SpaceSidebarSpace {
  id: string;
  name: string;
}

interface SpaceSidebarProps {
  user?: SidebarFooterUser;
  spaces: SpaceSidebarSpace[];
  navItems: SpaceNavItem[];
  onNavClick?: () => void;
}

export function SpaceSidebar({
  user,
  spaces,
  navItems,
  onNavClick,
}: SpaceSidebarProps) {
  const spaceItems = spaces.map((space) => ({
    key: space.id,
    href: spaceSectionPath(space.id, "upcoming"),
    label: space.name,
  }));

  return (
    <aside
      className="flex h-full flex-col gap-5 overflow-auto border-r border-line bg-[color-mix(in_srgb,var(--sidebar)_88%,white)] px-3.5 py-5"
      aria-label="Spaces and sections"
    >
      <SidebarHeader />
      <SidebarNavLinks title="Spaces" items={spaceItems} onClick={onNavClick} />
      <SidebarNavLinks
        title="In this Space"
        items={navItems}
        onClick={onNavClick}
      />
      <SidebarFooter user={user} />
    </aside>
  );
}
