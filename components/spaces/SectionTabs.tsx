"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SpaceNavItem } from "@/lib/spaces/nav";

interface SectionTabsProps {
  items: SpaceNavItem[];
}

/** The horizontal section strip under the view header. */
export function SectionTabs({ items }: SectionTabsProps) {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  const updateFades = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const sl = scroller.scrollLeft;
    const max = scroller.scrollWidth - scroller.clientWidth;
    setFadeLeft(sl > 4);
    setFadeRight(sl < max - 4);
  }, []);

  useEffect(() => {
    const activeItem = items.find((item) => item.href === pathname);
    if (!activeItem) return;
    const tab = tabRefs.current.get(activeItem.key);
    tab?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [pathname, items]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    updateFades();
    scroller.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);

    return () => {
      scroller.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
    };
  }, [updateFades, items]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onWheel = (event: WheelEvent) => {
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [items]);

  return (
    <div className="relative min-w-0 w-full max-w-full">
      {fadeLeft ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-px left-0 top-0 z-[2] w-5 bg-gradient-to-r from-bg from-20% to-transparent"
        />
      ) : null}
      {fadeRight ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-px right-0 top-0 z-[2] w-5 bg-gradient-to-l from-bg from-20% to-transparent"
        />
      ) : null}

      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Sections"
        className={[
          "flex w-full min-w-0 max-w-full snap-x snap-proximity gap-[0.3rem] overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth border-b border-line touch-pan-x",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        ].join(" ")}
      >
        {items.map((item) => {
          const active = item.href === pathname;
          return (
            <Link
              key={item.key}
              ref={(node) => {
                if (node) tabRefs.current.set(item.key, node);
                else tabRefs.current.delete(item.key);
              }}
              href={item.href}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              className={[
                "mb-[-1px] shrink-0 snap-start whitespace-nowrap rounded-t-[7px] border border-b-0 px-[0.85rem] py-[0.4rem] text-[0.8rem] font-medium transition-colors",
                active
                  ? "border-line bg-panel font-semibold text-ink shadow-[inset_0_2px_0_var(--accent)]"
                  : "border-transparent text-muted hover:bg-panel/75 hover:text-ink",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
