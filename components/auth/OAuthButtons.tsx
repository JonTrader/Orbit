"use client";

import { useState } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth/client";
import type { OAuthProviderId } from "@/lib/auth/oauth";

import { useAuthTheme } from "./theme";
import { AuthPendingMark, FormMessage, oauthButtonClass } from "./ui";

const PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "microsoft", label: "Continue with Microsoft" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.62 6.62 0 0 1 5.5 12c0-.72.12-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.47 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <rect fill="#F25022" x="1" y="1" width="10" height="10" />
      <rect fill="#7FBA00" x="13" y="1" width="10" height="10" />
      <rect fill="#00A4EF" x="1" y="13" width="10" height="10" />
      <rect fill="#FFB900" x="13" y="13" width="10" height="10" />
    </svg>
  );
}

export function OAuthButtons({
  providers,
  callbackURL = "/",
}: {
  providers: readonly OAuthProviderId[];
  callbackURL?: string;
}) {
  const theme = useAuthTheme();
  const visibleProviders = PROVIDERS.filter((provider) =>
    providers.includes(provider.id),
  );
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

  if (visibleProviders.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visibleProviders.map((provider) => {
        const busy = pending === provider.id;

        return (
          <button
            key={provider.id}
            type="button"
            disabled={pending !== null}
            aria-busy={busy}
            onClick={() => start(provider.id)}
            className={oauthButtonClass(theme)}
          >
            {busy ? (
              <AuthPendingMark label="Redirecting" />
            ) : provider.id === "google" ? (
              <GoogleMark />
            ) : (
              <MicrosoftMark />
            )}
            <span className={busy ? "opacity-90" : undefined}>{provider.label}</span>
          </button>
        );
      })}
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  );
}
