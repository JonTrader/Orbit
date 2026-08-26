"use client";

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--auth-ink)_12%,transparent)]" />
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-(--auth-muted)">
        {label}
      </span>
      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--auth-ink)_12%,transparent)]" />
    </div>
  );
}
