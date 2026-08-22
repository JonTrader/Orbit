import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { AgendaShell } from "@/components/orbit/AgendaShell";
import { hasCredentialAccount } from "@/lib/auth-access";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain-error";
import { buildSpaceNav } from "@/lib/space-nav";
import { listSections } from "@/lib/services/sections";
import { getSpace, listSpaces } from "@/lib/services/spaces";
import { requireVerifiedSession } from "@/lib/session";

const spaceParamsSchema = z.object({
  spaceId: z.uuid(),
});

interface SpaceLayoutProps {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}

/**
 * Chrome for the Active Space: membership is checked here once, so every
 * nested section view can trust the Space scope and focus on its content.
 */
export default async function SpaceLayout({ children, params }: SpaceLayoutProps) {
  const parsed = spaceParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const session = await requireVerifiedSession();
  const db = getDb();
  const userId = session.user.id;
  const spaceId = parsed.data.spaceId;

  let activeSpace;
  try {
    activeSpace = await getSpace(db, { userId, spaceId });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const [spaces, sections, canChangePassword] = await Promise.all([
    listSpaces(db, userId),
    listSections(db, { userId, spaceId }),
    hasCredentialAccount(db, userId),
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
      navItems={buildSpaceNav(spaceId, sections)}
    >
      {children}
    </AgendaShell>
  );
}
