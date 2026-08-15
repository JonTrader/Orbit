"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth-client";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/auth-paths";
import { AuthLink, Field, FormMessage, SubmitButton } from "./ui";

const MIN_PASSWORD_LENGTH = 8;

function createResetTokenStore() {
  let token: string | null = null;
  let initialized = false;

  return {
    getSnapshot() {
      if (!initialized && typeof window !== "undefined") {
        token = new URLSearchParams(window.location.hash.slice(1)).get("token");
        initialized = true;
      }
      return token;
    },
    getServerSnapshot: () => null,
    subscribe(listener: () => void) {
      const onHashChange = () => {
        token = new URLSearchParams(window.location.hash.slice(1)).get("token");
        initialized = true;
        window.history.replaceState(null, "", window.location.pathname);
        listener();
      };
      window.addEventListener("hashchange", onHashChange);
      return () => window.removeEventListener("hashchange", onHashChange);
    },
    scrubUrl() {
      window.history.replaceState(null, "", window.location.pathname);
    },
  };
}

export function ResetPasswordForm() {
  const router = useRouter();
  const resetTokenStore = useMemo(() => createResetTokenStore(), []);
  const token = useSyncExternalStore(
    resetTokenStore.subscribe,
    resetTokenStore.getSnapshot,
    resetTokenStore.getServerSnapshot,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Keep the bearer token in the external store only. It never enters a
    // request for the page, browser history, referrer, or a copied URL.
    resetTokenStore.scrubUrl();
  }, [resetTokenStore]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");

    if (password !== String(form.get("confirm") ?? "")) {
      setError("Those passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      setPending(false);

      if (failure) {
        setError(failure.message ?? "That reset link is no longer valid.");
        return;
      }

      router.push(SIGN_IN_PATH);
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage>That reset link is missing or expired.</FormMessage>
        <AuthLink href={FORGOT_PASSWORD_PATH}>Send a new one</AuthLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending}>Set new password</SubmitButton>
    </form>
  );
}
