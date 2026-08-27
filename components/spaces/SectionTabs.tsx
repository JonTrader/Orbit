"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SpaceNavItem } from "@/lib/spaces/nav";

interface SectionTabsProps {
  items: SpaceNavItem[];
}

/** The horizontal section strip under the view header. */
export function SectionTabs({ items }: SectionTabsProps) {
  const pathname = usePathname();

  return (
    <div
      className="mb-4 flex flex-wrap gap-1 border-b border-line pb-0.5"
      role="tablist"
      aria-label="Sections"
    >
      {items.map((item) => {
        const active = item.href === pathname;
        return (
          <Link
            key={item.key}
            href={item.href}
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            className={[
              "mb-[-2px] border-b-2 px-3 py-2 text-[0.875rem] font-medium",
              active
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
