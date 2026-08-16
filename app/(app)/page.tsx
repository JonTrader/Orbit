import { AgendaShell } from "@/components/orbit/AgendaShell";
import { hasCredentialAccount } from "@/lib/auth-access";
import { getDb } from "@/lib/db/client";
import { requireVerifiedSession } from "@/lib/session";

export default async function HomePage() {
  const session = await requireVerifiedSession();
  const canChangePassword = await hasCredentialAccount(
    getDb(),
    session.user.id,
  );

  return (
    <AgendaShell
      user={{
        name: session.user.name,
        email: session.user.email,
        canChangePassword,
      }}
    />
  );
}
