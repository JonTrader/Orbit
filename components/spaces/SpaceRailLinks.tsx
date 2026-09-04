"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SpaceOrbit } from "./SpaceOrbit";
import type { SidebarNavItem } from "./SidebarNavLinks";

interface SpaceRailLinksProps {
  title: string;
  items: SidebarNavItem[];
  onClick?: () => void;
}

function isActive(item: SidebarNavItem, pathname: string): boolean {
  if (item.href === pathname) return true;
  if (item.activePrefix === undefined) return false;
  return (
    pathname === item.activePrefix ||
    pathname.startsWith(`${item.activePrefix}/`)
  );
}

export function SpaceRailLinks({ title, items, onClick }: SpaceRailLinksProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5">
      <div className="px-2 pb-1.5 pt-5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
        {title}
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Space list">
        {items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onClick}
              className={[
                "flex items-center gap-2.5 rounded-lg px-1.5 py-2 text-[0.84rem] font-medium transition-colors",
                active
                  ? "bg-panel font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                  : "text-muted hover:bg-panel/75 hover:text-ink",
              ].join(" ")}
            >
              <SpaceOrbit active={active} />
              <span className="min-w-0 truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
