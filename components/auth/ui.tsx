import type { InputHTMLAttributes, ReactNode } from "react";

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded border border-line bg-panel px-5 py-6 shadow-[0_1px_0_rgba(28,25,23,0.04)] sm:px-6">
      <h1 className="text-[1.4rem] font-bold tracking-[-0.03em]">{title}</h1>
      {intro ? (
        <p className="mt-1.5 text-[0.9rem] leading-relaxed text-muted">{intro}</p>
      ) : null}
      <div className="mt-5">{children}</div>
      {footer ? (
        <div className="mt-5 border-t border-line pt-4 text-[0.85rem] text-muted">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <input
        {...input}
        className="rounded border border-line bg-[color-mix(in_srgb,var(--panel)_60%,white)] px-3 py-2.5 text-[0.95rem] outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
      />
      {hint ? <span className="text-[0.75rem] text-muted">{hint}</span> : null}
    </label>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded bg-ink px-4 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-accent/40 bg-accent/8 text-accent"
      : "border-teal/40 bg-teal/8 text-teal";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded border px-3 py-2 text-[0.85rem] ${styles}`}
    >
      {children}
    </p>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
