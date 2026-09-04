/**
 * Streaming shell for the Upcoming view. Mirrors the page anatomy - panel
 * header, day-group labels, and timeline rows with the narrow date column -
 * so switching to Upcoming paints this instantly while the real groups
 * resolve.
 *
 * Purely presentational: no data access. The pulse is disabled globally for
 * reduced-motion users.
 */

/** Varied day-group label widths so groups read as distinct buckets. */
const GROUP_LABEL_WIDTHS = ["w-16", "w-12", "w-28"];

export default function UpcomingLoading() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="animate-pulse">
        <div className="overflow-hidden rounded border border-line bg-panel">
          <div className="px-4 pb-1.5 pt-3.5">
            <div className="h-2 w-20 rounded bg-line" />
          </div>
          <div className="border-t border-line">
            {GROUP_LABEL_WIDTHS.map((labelWidth, groupIndex) => (
              <section key={labelWidth}>
                <div
                  className={[
                    "px-4 py-2",
                    groupIndex > 0 ? "mt-1 border-t border-line" : "",
                  ].join(" ")}
                >
                  {/* Overdue groups render in accent; echo that weight. */}
                  <div
                    className={[
                      "h-2 rounded",
                      labelWidth,
                      groupIndex === 0 ? "bg-accent/60" : "bg-line",
                    ].join(" ")}
                  />
                </div>
                {[0, 1].map((rowIndex) => (
                  <div
                    key={`${labelWidth}-${rowIndex}`}
                    className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0"
                  >
                    <div className="ml-auto h-2.5 w-10 shrink-0 rounded bg-line" />
                    <div className="min-w-0 flex-1">
                      <div className="h-3.5 w-[52%] rounded bg-line" />
                      <div className="mt-1 h-2 w-24 rounded bg-line" />
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
