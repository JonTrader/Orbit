"use client";

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
