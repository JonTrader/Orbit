"use client";

import { useEffect } from "react";

export default function Error({
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
    <main className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col justify-center px-4 py-16 sm:px-6">
      <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-accent">
        Orbit
      </p>
      <h1 className="text-[1.75rem] font-bold tracking-[-0.03em]">
        Something went wrong
      </h1>
      <p className="mt-2 text-[0.95rem] text-muted">
        This view failed to load. You can try again, or come back later.
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
  );
}
