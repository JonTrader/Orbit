import type { section, SectionKind } from "@/lib/db/schema";
import {
  customSectionPath,
  spaceSectionPath,
  type SystemSectionSlug,
} from "./paths";

type SectionRow = typeof section.$inferSelect;

/** One entry of the fixed Upcoming / Daily / Monthlies / custom nav. */
export interface SpaceNavItem {
  key: string;
  href: string;
  label: string;
  /** Header description shown under the view title. */
  sub: string;
}

const SYSTEM_NAV_ORDER: SystemSectionSlug[] = [
  "upcoming",
  "daily",
  "monthlies",
];

const SYSTEM_NAV_META: Record<
  SystemSectionSlug,
  { label: string; sub: string }
> = {
  upcoming: {
    label: "Upcoming",
    sub: "Monthlies and dated items in this Space.",
  },
  daily: { label: "Daily", sub: "Day-to-day to-dos for this Space." },
  monthlies: {
    label: "Monthlies",
    sub: "Recurring monthly obligations.",
  },
};

type CustomSectionKind = "tasks" | "notes" | "mixed";

function isCustomSectionKind(kind: SectionKind): kind is CustomSectionKind {
  return kind === "tasks" || kind === "notes" || kind === "mixed";
}

const CUSTOM_SECTION_SUB: Record<CustomSectionKind, string> = {
  tasks: "Custom checklist Section.",
  notes: "Freeform Notes for this Space.",
  mixed: "Tasks and Notes together.",
};

/**
 * Builds the fixed-order Active Space nav: Upcoming, Daily, Monthlies, then
 * custom Sections in their stored order. Pure so layouts and pages share it.
 */
export function buildSpaceNav(
  spaceId: string,
  sections: SectionRow[],
): SpaceNavItem[] {
  const systemItems = SYSTEM_NAV_ORDER.map((slug) => ({
    key: slug,
    href: spaceSectionPath(spaceId, slug),
    ...SYSTEM_NAV_META[slug],
  }));

  const customItems = sections.flatMap((row) => {
    const kind = row.kind;
    if (row.isSystem || !isCustomSectionKind(kind)) return [];
    return [
      {
        key: row.id,
        href: customSectionPath(spaceId, row.id),
        label: row.name,
        sub: CUSTOM_SECTION_SUB[kind],
      },
    ];
  });

  return [...systemItems, ...customItems];
}
