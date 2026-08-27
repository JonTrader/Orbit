/**
 * Streaming shell for the Daily view. Mirrors the page anatomy - "N open"
 * panel header, checkbox row list, and the quick-add compose bar - so a tab
 * switch paints this instantly while Tasks resolve.
 *
 * Purely presentational: no data access. The pulse is disabled globally for
 * reduced-motion users.
 */

/** Varied row title widths so the checklist reads as content, not one slab. */
const ROW_TITLE_WIDTHS = ["46%", "61%", "38%", "54%"];

export default function DailyLoading() {
  return (
    <>
      <div role="status">
        <span className="sr-only">Loading…</span>
      </div>
      <div aria-hidden className="animate-pulse">
        <div className="overflow-hidden rounded border border-line bg-panel">
          <div className="px-4 pb-1.5 pt-3.5">
            <div className="h-2 w-24 rounded bg-line" />
          </div>
          <div className="border-t border-line">
            {ROW_TITLE_WIDTHS.map((width, index) => (
              <div
                key={width}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="size-5 shrink-0 rounded border border-line" />
                <div className="h-3.5 rounded bg-line" style={{ width }} />
                {index % 2 === 1 ? (
                  <div className="ml-auto h-2.5 w-10 shrink-0 rounded bg-line" />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3.5 flex gap-2">
          <div className="min-w-0 flex-1 rounded border border-line bg-panel px-3.5 py-2.5">
            <div className="h-4 w-1/3 rounded bg-line" />
          </div>
          <div className="w-16 shrink-0 rounded bg-line" />
        </div>
      </div>
    </>
  );
}
