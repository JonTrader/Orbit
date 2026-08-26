/**
 * Streaming shell for the Monthlies view. Mirrors the page anatomy - "N
 * tracked" panel header, title + due-date rows ending in the Done button,
 * and the compose bar with its Day input - so a tab switch paints this
 * instantly while Monthlies resolve.
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
            {ROW_TITLE_WIDTHS.map((width) => (
              <div
                key={width}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="h-3.5 rounded bg-line" style={{ width }} />
                <div className="ml-auto h-2.5 w-14 shrink-0 rounded bg-line" />
                <div className="h-[1.75rem] w-14 shrink-0 rounded border border-line" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3.5 flex gap-2">
          <div className="min-w-0 flex-1 rounded border border-line bg-panel px-3.5 py-2.5">
            <div className="h-4 w-2/5 rounded bg-line" />
          </div>
          <div className="w-20 shrink-0 rounded border border-line bg-panel px-3 py-2.5" />
          <div className="w-16 shrink-0 rounded bg-line" />
        </div>
      </div>
    </>
  );
}
