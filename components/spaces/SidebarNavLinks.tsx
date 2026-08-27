"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarNavItem {
  key: string;
  href: string;
  label: string;
  /**
   * Also treat this path and anything under it as active. Used by the Spaces
   * list: the link targets the Space's Upcoming view, but the Space stays
   * highlighted on every one of its sections.
   */
  activePrefix?: string;
}

interface SidebarNavLinksProps {
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

export function SidebarNavLinks({ title, items, onClick }: SidebarNavLinksProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 pb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
        {title}
      </div>
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onClick}
            className={[
              "w-full rounded py-1.5 pl-5 pr-2 text-left text-[0.82rem]",
              active
                ? "bg-panel font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                : "font-normal text-muted hover:bg-panel/70",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
