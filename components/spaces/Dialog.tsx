"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "./Button";

interface DialogProps {
  title: string;
  onClose: () => void;
  /** Server Action in flight; disables close paths and the submit button. */
  pending: boolean;
  error?: string | null;
  submitLabel: string;
  /** Submit label while pending. */
  pendingLabel: string;
  submitDisabled?: boolean;
  /** Destructive submits use the accent fill instead of ink. */
  tone?: "default" | "danger";
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

/** True after hydration so portals can target document.body. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Shared modal scaffold for Space dialogs: backdrop with click-outside
 * close, Escape-to-close, a focus trap, the error line, and the Cancel /
 * submit footer. Form fields arrive as children inside the form.
 *
 * Portaled to document.body so fixed positioning is not trapped by
 * transformed ancestors (mobile sidebar translate, overflow clipping).
 */
export function Dialog({
  title,
  onClose,
  pending,
  error,
  submitLabel,
  pendingLabel,
  submitDisabled = false,
  tone = "default",
  onSubmit,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isClient = useIsClient();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!pending) onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Keep focus cycling inside the dialog while it is open.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, input, textarea, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, onClose]);

  if (!isClient) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 p-4 pt-24 sm:pt-32"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm overflow-hidden rounded border border-line bg-panel shadow-[0_16px_48px_rgba(28,25,23,0.12)]"
      >
        <form onSubmit={onSubmit} className="p-4">
          <h2 className="mb-3 text-[1rem] font-semibold text-ink">{title}</h2>

          <div className="flex flex-col gap-3">{children}</div>

          {error ? (
            <p role="alert" className="mt-3 text-[0.8rem] font-medium text-accent">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded px-3 py-1.5 text-[0.85rem] font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              type="submit"
              pending={pending}
              pendingLabel={pendingLabel}
              disabled={submitDisabled}
              className={[
                "rounded px-3 py-1.5 text-[0.85rem] font-semibold text-white disabled:opacity-50",
                tone === "danger" ? "bg-accent" : "bg-ink",
              ].join(" ")}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

interface DialogRadioPillOption<T extends string> {
  value: T;
  label: string;
}

interface DialogRadioPillsProps<T extends string> {
  /** Radio group name; must be unique per dialog. */
  name: string;
  label: string;
  value: T;
  options: readonly DialogRadioPillOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * Labelled pill-style radio group used inside dialogs. Real radios are
 * visually hidden so keyboard and screen-reader selection still work.
 */
export function DialogRadioPills<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: DialogRadioPillsProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.8rem] font-semibold text-muted">{label}</span>
      <div className="flex gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={[
              "flex-1 cursor-pointer rounded border px-2 py-2 text-center text-[0.85rem]",
              value === option.value
                ? "border-accent bg-accent/10 font-semibold text-ink"
                : "border-line bg-panel text-muted hover:border-muted",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Labelled text field group used inside dialogs. */
export function DialogField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[0.8rem] font-semibold text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
