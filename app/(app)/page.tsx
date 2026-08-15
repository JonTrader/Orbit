import { AgendaShell } from "@/components/orbit/AgendaShell";
import { requireVerifiedSession } from "@/lib/session";

export default async function HomePage() {
  const session = await requireVerifiedSession();

  return (
    <AgendaShell
      user={{ name: session.user.name, email: session.user.email }}
    />
  );
}
