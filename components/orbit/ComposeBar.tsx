"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { quickAdd } from "@/lib/actions/quick-add";

interface ComposeBarProps {
  spaceId: string;
  sectionId: string;
  /** Compose input label; also used as the placeholder. */
  label: string;
}

/** Quick-add form targeting one Section of the Active Space. */
export function ComposeBar({ spaceId, sectionId, label }: ComposeBarProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;

    startTransition(async () => {
      const result = await quickAdd({ spaceId, sectionId, title: trimmed });
      if (result.ok) {
        setTitle("");
        setError(null);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="mt-3.5">
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`${label}…`}
          aria-label={label}
          disabled={pending}
          className="flex-1 rounded border border-line bg-panel px-3.5 py-2.5 text-base outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="rounded bg-ink px-4 text-[0.85rem] font-semibold text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8rem] font-medium text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
