"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth/client";
import { APP_PATH, verifyEmailPath } from "@/lib/auth/paths";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

import { Field } from "@/components/auth/kit/AuthField";
import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

export function SignUpForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.signUp.email({
        name: String(form.get("name") ?? "").trim(),
        email,
        password: String(form.get("password") ?? ""),
        callbackURL: APP_PATH,
      });

      setPending(false);

      if (failure) {
        setError(failure.message ?? "Could not create that account.");
        return;
      }

      // No session yet: the address has to be verified first (spec §3).
      router.push(verifyEmailPath(email));
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field label="Name" name="name" autoComplete="name" required />
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
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
