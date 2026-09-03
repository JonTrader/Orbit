/**
 * Streaming shell for the all-Spaces directory. Mirrors the page anatomy -
 * title row and a panel of Space rows with meta + Open - so the route paints
 * instantly while directory entries resolve.
 *
 * Purely presentational: no data access. The pulse is disabled globally for
 * reduced-motion users.
 */

/** Varied row title widths so the list reads as content, not one gray slab. */
const ROW_TITLE_WIDTHS = ["42%", "55%", "36%", "48%", "40%"];

export default function SpacesLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div role="status">
        <span className="sr-only">Loading…</span>
        <div aria-hidden className="animate-pulse">
          <div className="mb-4 h-6 w-28 rounded bg-line" />
          <div className="overflow-hidden rounded border border-line bg-panel">
            <div className="px-4 pb-1.5 pt-3.5">
              <div className="h-2 w-16 rounded bg-line" />
            </div>
            <div className="border-t border-line">
              {ROW_TITLE_WIDTHS.map((width) => (
                <div
                  key={width}
                  className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="h-3.5 rounded bg-line" style={{ width }} />
                    <div className="mt-1.5 h-2 w-[70%] rounded bg-line" />
                  </div>
                  <div className="mt-1 h-2.5 w-10 shrink-0 rounded bg-line" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
