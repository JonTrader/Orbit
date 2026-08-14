"use client";

import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";

import { useAuthTheme, type AuthTheme } from "./theme";

const fieldInput: Record<AuthTheme, string> = {
  pad: "rounded-sm border border-[color-mix(in_srgb,var(--auth-ink)_14%,transparent)] bg-white px-3 py-2.5 text-[1rem] outline-none focus:border-[var(--auth-clay)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--auth-clay)_18%,transparent)]",
  burner:
    "rounded-none border-0 border-b-[1.5px] border-[color-mix(in_srgb,var(--auth-ink)_18%,transparent)] bg-transparent px-0.5 py-2.5 text-[1rem] outline-none focus:border-[var(--auth-copper)]",
};

const submitBtn: Record<AuthTheme, string> = {
  pad: "mt-1 inline-flex w-fit items-center justify-center gap-2 rounded-none bg-[var(--auth-ink)] px-4 py-2.5 text-[0.92rem] font-bold text-[#f4f1ea] disabled:cursor-wait disabled:opacity-60",
  burner:
    "mt-1 inline-flex w-full items-center justify-center gap-2 rounded-none bg-[var(--auth-ink)] px-4 py-3 text-[0.92rem] font-bold text-[var(--auth-butcher)] disabled:cursor-wait disabled:opacity-60",
};

const oauthBtn: Record<AuthTheme, string> = {
  pad: "flex items-center justify-center gap-2 rounded-sm border border-[color-mix(in_srgb,var(--auth-ink)_14%,transparent)] bg-white px-4 py-2.5 text-[0.9rem] font-semibold hover:border-[color-mix(in_srgb,var(--auth-ink)_28%,transparent)] disabled:cursor-wait disabled:opacity-60",
  burner:
    "flex items-center justify-center gap-2 border border-[color-mix(in_srgb,var(--auth-ink)_16%,transparent)] bg-transparent px-4 py-2.5 text-[0.88rem] font-semibold hover:border-[color-mix(in_srgb,var(--auth-ink)_28%,transparent)] disabled:cursor-wait disabled:opacity-60",
};

const accentLink: Record<AuthTheme, string> = {
  pad: "font-bold text-[var(--auth-clay)] hover:underline",
  burner: "font-bold text-[var(--auth-copper)] hover:underline",
};

const mutedLink: Record<AuthTheme, string> = {
  pad: "font-medium text-[var(--auth-muted)] hover:text-[var(--auth-ink)]",
  burner:
    "font-medium text-[color-mix(in_srgb,var(--auth-ink)_55%,var(--auth-ash))] hover:text-[var(--auth-ink)]",
};

export function AuthHeading({
  title,
  intro,
}: {
  title: string;
  intro?: ReactNode;
}) {
  const theme = useAuthTheme();
  const titleClass = "text-[1.85rem] font-bold tracking-[-0.03em] leading-tight";

  return (
    <header>
      <h1 className={titleClass}>{title}</h1>
      {intro ? (
        <p
          className={[
            "mt-1.5 text-[0.95rem] leading-relaxed",
            theme === "pad"
              ? "max-w-88 text-var(--auth-muted)"
              : "text-[color-mix(in_srgb,var(--auth-ink)_62%,var(--auth-ash))]",
          ].join(" ")}
        >
          {intro}
        </p>
      ) : null}
    </header>
  );
}

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
    <section className="flex flex-col">
      <AuthHeading title={title} intro={intro} />
      <div className="mt-5">{children}</div>
      {footer ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[0.88rem] text-(--auth-muted)">
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
  const theme = useAuthTheme();

  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-(--auth-muted)">
        {label}
      </span>
      <input {...input} className={fieldInput[theme]} />
      {hint ? (
        <span className="text-[0.75rem] text-(--auth-muted)">{hint}</span>
      ) : null}
    </label>
  );
}

/** Compact orbital wait mark - product-literal, not a generic spinner. */
export function AuthPendingMark({ label = "Working" }: { label?: string }) {
  return (
    <span className="auth-orbit" role="status" aria-label={label}>
      <span className="auth-orbit__path" aria-hidden="true" />
      <span className="auth-orbit__track" aria-hidden="true">
        <span className="auth-orbit__arm">
          <span className="auth-orbit__bit" />
        </span>
      </span>
    </span>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  const theme = useAuthTheme();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={submitBtn[theme]}
    >
      {pending ? (
        <>
          <AuthPendingMark />
          <span className="opacity-90">{children}</span>
        </>
      ) : (
        children
      )}
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
  const theme = useAuthTheme();
  const styles =
    tone === "info"
      ? "border-[color-mix(in_srgb,#0f766e_40%,transparent)] bg-[color-mix(in_srgb,#0f766e_8%,transparent)] text-[#0f766e]"
      : theme === "pad"
        ? "border-[color-mix(in_srgb,var(--auth-clay)_40%,transparent)] bg-[color-mix(in_srgb,var(--auth-clay)_8%,transparent)] text-[var(--auth-clay)]"
        : "border-[color-mix(in_srgb,var(--auth-copper)_40%,transparent)] bg-[color-mix(in_srgb,var(--auth-copper)_8%,transparent)] text-[var(--auth-copper)]";

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-sm border px-3 py-2 text-[0.85rem] ${styles}`}
    >
      {children}
    </p>
  );
}

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

export function AuthLink({
  href,
  tone = "accent",
  children,
}: {
  href: string;
  tone?: "accent" | "muted";
  children: ReactNode;
}) {
  const theme = useAuthTheme();
  const className = tone === "accent" ? accentLink[theme] : mutedLink[theme];

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function oauthButtonClass(theme: AuthTheme) {
  return oauthBtn[theme];
}
