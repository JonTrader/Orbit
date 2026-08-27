/**
 * Streaming shell for every Space view. The tab strip lives in the layout,
 * so this file only skeletons the content panel that section views render.
 *
 * Purely presentational: no data access, so it renders without touching the
 * database. The pulse is disabled globally for reduced-motion users.
 */

/** Varied row title widths so the panel reads as content, not one gray slab. */
const ROW_TITLE_WIDTHS = ["44%", "58%", "37%", "52%", "45%", "40%"];

export default function SpaceLoading() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="animate-pulse">
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
      </div>
    </div>
  );
}
