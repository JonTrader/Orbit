/**
 * Route constants for the agenda UI. Free of server imports so client
 * components can build Active Space links from them.
 */
export function spacePath(spaceId: string): string {
  return `/spaces/${spaceId}`;
}
