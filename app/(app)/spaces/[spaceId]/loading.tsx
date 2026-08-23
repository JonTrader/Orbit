/**
 * Streaming shell for every Space view. Mirrors the section-page anatomy -
 * tab strip, agenda panel, compose bar - so a tab switch paints this shell
 * instantly (and unlocks Next's prefetching of dynamic Space routes) instead
 * of freezing on the outgoing view until the server render lands.
 *
 * Purely presentational: no data access, so it renders without touching the
 * database. The pulse is disabled globally for reduced-motion users.
 */

/** Tab pill widths echoing Upcoming / Daily / Monthlies / a custom Section. */
const TAB_WIDTHS = ["5.25rem", "3.5rem", "5.75rem", "4.25rem"];

/** Varied row title widths so the panel reads as content, not one gray slab. */
const ROW_TITLE_WIDTHS = ["44%", "58%", "37%", "52%", "45%", "40%"];

export default function SpaceLoading() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="animate-pulse">
        <div
          className="mb-4 flex flex-wrap gap-1 border-b border-line pb-0.5"
          // Mirrors SectionTabs: same padding, minus the text-height tabs.
          style={{ minHeight: "2.55rem" }}
        >
          {TAB_WIDTHS.map((width) => (
            <div key={width} className="mb-[-2px] px-3 py-2">
              <div className="h-3.5 rounded bg-line" style={{ width }} />
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded border border-line bg-panel">
          {/* Panel header strip, e.g. "Daily · 5 open". */}
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
                <div
                  className="h-3.5 rounded bg-line"
                  style={{ width }}
                />
                {index % 3 === 0 ? (
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
    </div>
  );
}
