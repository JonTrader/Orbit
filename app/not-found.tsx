import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col justify-center px-4 py-16 sm:px-6">
      <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-accent">
        Orbit
      </p>
      <h1 className="text-[1.75rem] font-bold tracking-[-0.03em]">
        Page not found
      </h1>
      <p className="mt-2 text-[0.95rem] text-muted">
        That route does not exist in Orbit.
      </p>
      <Link
        href="/"
        className="mt-6 w-fit rounded bg-ink px-4 py-2.5 text-[0.85rem] font-semibold text-white"
      >
        Back to agenda
      </Link>
    </main>
  );
}
