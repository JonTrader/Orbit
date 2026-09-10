"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth/client";
import { authCallbackUrl, verifyEmailPath } from "@/lib/auth/paths";

import { Field } from "@/components/auth/kit/AuthField";
import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

export function SignInForm({
  continuation = null,
}: {
  continuation?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackURL = authCallbackUrl(continuation);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.signIn.email({
        email,
        password: String(form.get("password") ?? ""),
        callbackURL,
      });

      if (!failure) {
        // Better Auth set the session cookie; enter via `/` for Personal Space.
        router.replace(callbackURL);
        return;
      }

      setPending(false);

      // Better Auth just sent a fresh link, so send them to the waiting room.
      if (failure.code === EMAIL_NOT_VERIFIED) {
        router.push(verifyEmailPath(email, continuation));
        return;
      }

      setError(failure.message ?? "Could not sign in with those details.");
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
