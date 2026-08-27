/**
 * Streaming shell for a custom tasks Section view. Mirrors the panel anatomy -
 * section header and checklist rows - so a custom Section paints instantly
 * while its Tasks resolve.
 *
 * Purely presentational: no data access. The pulse is disabled globally for
 * reduced-motion users.
 */

/** Varied row title widths so the checklist reads as content, not one slab. */
const ROW_TITLE_WIDTHS = ["46%", "61%", "38%", "54%"];

export default function CustomSectionLoading() {
  return (
    <>
      <div role="status">
        <span className="sr-only">Loading…</span>
      </div>
      <div aria-hidden className="animate-pulse">
        <div className="overflow-hidden rounded border border-line bg-panel">
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
                {index % 2 === 1 ? (
                  <div className="ml-auto h-2.5 w-10 shrink-0 rounded bg-line" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
