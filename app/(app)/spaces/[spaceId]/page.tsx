import { notFound } from "next/navigation";
import { z } from "zod";

import { AgendaShell } from "@/components/orbit/AgendaShell";
import { hasCredentialAccount } from "@/lib/auth-access";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain-error";
import { getSpace, listSpaces } from "@/lib/services/spaces";
import { requireVerifiedSession } from "@/lib/session";

const spaceParamsSchema = z.object({
  spaceId: z.uuid(),
});

interface SpacePageProps {
  params: Promise<{ spaceId: string }>;
}

export default async function SpacePage({ params }: SpacePageProps) {
  const parsed = spaceParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const session = await requireVerifiedSession();
  const db = getDb();
  const spaceId = parsed.data.spaceId;

  let activeSpace;
  try {
    activeSpace = await getSpace(db, {
      userId: session.user.id,
      spaceId,
    });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const [canChangePassword, spaces] = await Promise.all([
    hasCredentialAccount(db, session.user.id),
    listSpaces(db, session.user.id),
  ]);

  return (
    <AgendaShell
      user={{
        name: session.user.name,
        email: session.user.email,
        canChangePassword,
      }}
      activeSpace={{ id: activeSpace.id, name: activeSpace.name }}
      spaces={spaces.map((space) => ({ id: space.id, name: space.name }))}
    />
  );
}
