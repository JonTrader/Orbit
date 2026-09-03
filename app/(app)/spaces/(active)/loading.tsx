/**
 * Fallback for `{children}` inside `(active)/layout`. SpaceSidebarShell is already
 * mounted, so this only skeletons the main panel (header, tabs, content).
 * Section `loading.tsx` files cover the content slot after `[spaceId]` chrome
 * is up.
 */

const TAB_WIDTHS = ["22%", "16%", "20%", "18%"];
const ROW_TITLE_WIDTHS = ["44%", "58%", "37%", "52%", "45%", "40%"];

export default function ActiveSpaceLoading() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div
        aria-hidden
        className="mx-auto w-full min-w-0 max-w-[720px] overflow-x-hidden px-4 py-5 pb-16 sm:px-6 sm:py-6"
      >
        <div className="mb-5 animate-pulse">
          <div className="mb-1 h-2 w-36 rounded bg-line" />
          <div className="h-7 w-40 rounded bg-line" />
          <div className="mt-2 h-3 w-56 rounded bg-line" />
        </div>

        <div className="mb-4 flex animate-pulse items-end gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
            {TAB_WIDTHS.map((width) => (
              <div
                key={width}
                className="h-8 rounded border border-line bg-panel"
                style={{ width }}
              />
            ))}
          </div>
          <div className="h-8 w-8 shrink-0 rounded border border-line bg-panel" />
        </div>

        <div className="animate-pulse overflow-hidden rounded border border-line bg-panel">
          <div className="px-4 pb-1.5 pt-3.5">
            <div className="h-2 w-28 rounded bg-line" />
          </div>
          <div className="border-t border-line">
            {ROW_TITLE_WIDTHS.map((width, index) => (
              <div
                key={width}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="size-5 shrink-0 rounded border border-line" />
                <div className="h-3.5 rounded bg-line" style={{ width }} />
                {index % 3 === 0 ? (
                  <div className="ml-auto h-2.5 w-10 shrink-0 rounded bg-line" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
