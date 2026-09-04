/**
 * Fallback for `{children}` inside `(active)/layout`. SpaceSidebarShell is
 * already mounted, so this only covers the main panel while `[spaceId]` chrome
 * resolves. Section `loading.tsx` files take over once SpaceLayout is up.
 */
export default function ActiveSpaceLoading() {
  return (
    <div
      role="status"
      className="mx-auto flex min-h-[50vh] w-full min-w-0 max-w-[720px] items-center justify-center px-4 py-5 sm:px-6"
    >
      <span className="sr-only">Loading…</span>
      <span
        aria-hidden
        className="size-7 animate-spin rounded-full border-2 border-line border-t-accent"
      />
    </div>
  );
}
