/**
 * Person name on Task / Monthly rows. Sentence case and muted, so Assignees
 * read as people rather than system meta (dates stay mono uppercase).
 */
export function AssigneeName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={[
        "max-w-[7.5rem] shrink-0 truncate text-[0.78rem] text-muted",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {name}
    </span>
  );
}
