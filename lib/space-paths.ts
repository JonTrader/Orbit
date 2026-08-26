/**
 * Route constants for the agenda UI. Free of server imports so client
 * components can build Active Space links from them.
 */
/** The fixed nav slugs for Upcoming, Daily, and Monthlies. */
export type SystemSectionSlug = "upcoming" | "daily" | "monthlies";

export function spaceSectionPath(
  spaceId: string,
  slug: SystemSectionSlug,
): string {
  return `/spaces/${spaceId}/${slug}`;
}

/**
 * The bare Space layout URL. Server Actions revalidate this concrete path so
 * a mutation refreshes only the Space it touched, never sibling Spaces.
 */
export function spaceLayoutPath(spaceId: string): string {
  return `/spaces/${spaceId}`;
}

export function customSectionPath(
  spaceId: string,
  sectionId: string,
): string {
  return `/spaces/${spaceId}/sections/${sectionId}`;
}

/**
 * Revalidation target for Server Actions that mutate Space content. The
 * layout-level pattern refreshes the Active Space chrome and every nested
 * section view at once.
 */
export const SPACE_LAYOUT_PATTERN = "/spaces/[spaceId]";
