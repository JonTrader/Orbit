"use client";

import { useState } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth-client";

import { FormMessage } from "./ui";

const PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "microsoft", label: "Continue with Microsoft" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export function OAuthButtons({ callbackURL = "/" }: { callbackURL?: string }) {
  const [pending, setPending] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: ProviderId) {
    setPending(provider);
    setError(null);

    try {
      const { error: failure } = await authClient.signIn.social({
        provider,
        callbackURL,
      });

      if (failure) {
        setPending(null);
        setError(failure.message ?? "That provider is unavailable right now.");
      }
    } catch {
      setPending(null);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          type="button"
          disabled={pending !== null}
          onClick={() => start(provider.id)}
          className="rounded border border-line bg-[color-mix(in_srgb,var(--panel)_60%,white)] px-4 py-2.5 text-[0.9rem] font-semibold hover:border-ink/25 disabled:opacity-60"
        >
          {pending === provider.id ? "Redirecting…" : provider.label}
        </button>
      ))}
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  );
}
