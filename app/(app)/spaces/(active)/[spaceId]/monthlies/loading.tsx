/**
 * Streaming shell / Suspense fallback for the Monthlies view. Mirrors the
 * panel anatomy - "N tracked" header and title + optional Description rows
 * ending in the due date, Done button, and overflow menu - so a load paints
 * instantly while Monthlies resolve. Serves double duty as the Suspense
 * fallback in page.tsx, so there is one skeleton per route.
 *
 * The compose bar is not part of this shell: it needs no reads and renders
 * statically beside the streamed slot.
 *
 * Purely presentational: no data access. The pulse is disabled globally for
 * reduced-motion users.
 */

/** Varied row title widths so the list reads as content, not one slab. */
const ROW_TITLE_WIDTHS = ["50%", "42%", "58%", "36%"];

export default function MonthliesLoading() {
  return (
    <>
      <div role="status">
        <span className="sr-only">Loading…</span>
      </div>
      <div aria-hidden className="animate-pulse">
        <div className="overflow-hidden rounded border border-line bg-panel">
          <div className="px-4 pb-1.5 pt-3.5">
            <div className="h-2 w-32 rounded bg-line" />
          </div>
          <div className="border-t border-line">
            {ROW_TITLE_WIDTHS.map((width, index) => (
              <div
                key={width}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="h-3.5 rounded bg-line" style={{ width }} />
                  {index % 2 === 1 ? (
                    <div className="mt-2 h-2.5 w-[70%] rounded bg-line" />
                  ) : null}
                </div>
                <div className="h-2.5 w-14 shrink-0 rounded bg-line" />
                <div className="h-7 w-14 shrink-0 rounded border border-line" />
                <div className="size-7 shrink-0 rounded bg-line" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
