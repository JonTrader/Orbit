"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full font-sans antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col justify-center px-4 py-16 sm:px-6">
          <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-accent">
            Orbit
          </p>
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em]">
            Something went wrong
          </h1>
          <p className="mt-2 text-[0.95rem] text-muted">
            Orbit could not recover from this error. Try again, or reload the
            page.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-[0.7rem] text-muted">
              Ref · {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 w-fit rounded bg-ink px-4 py-2.5 text-[0.85rem] font-semibold text-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
