import { Suspense, type ReactNode } from "react";

import { SidebarSpaces, SidebarSpacesSkeleton } from "@/components/spaces/SidebarSpaces";
import { SpaceSidebarShell } from "@/components/spaces/SpaceSidebarShell";
import { hasCredentialAccount } from "@/lib/auth/access";
import { requireVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";

interface ActiveSpacesLayoutProps {
  children: ReactNode;
}

/**
 * Persistent SpaceSidebarShell for Active Space routes. Sits above `[spaceId]`
 * so the sidebar and Spaces list Suspense tree stay mounted across Space switches.
 * The `/spaces/all` directory stays outside this route group.
 */
export default async function ActiveSpacesLayout({
  children,
}: ActiveSpacesLayoutProps) {
  const session = await requireVerifiedSession();
  const canChangePassword = await hasCredentialAccount(
    getDb(),
    session.user.id,
  );

  return (
    <SpaceSidebarShell
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
      canChangePassword={canChangePassword}
      spacesSlot={
        <Suspense fallback={<SidebarSpacesSkeleton />}>
          <SidebarSpaces userId={session.user.id} />
        </Suspense>
      }
    >
      {children}
    </SpaceSidebarShell>
  );
}
