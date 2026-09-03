import { Suspense, type ReactNode } from "react";

import { ActiveSpaceProvider } from "@/components/spaces/ActiveSpaceProvider";
import { ShareBarSlot } from "@/components/spaces/ShareBarSlot";
import { SidebarSpaces, SidebarSpacesSkeleton } from "@/components/spaces/SidebarSpaces";
import { SpaceLayout } from "@/components/spaces/SpaceLayout";
import { getActiveSpace } from "@/lib/spaces/active-space";
import { buildSpaceNav } from "@/lib/spaces/nav";
import { resolveSpaceContext } from "@/lib/spaces/params";

interface SpaceRouteLayoutProps {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}

/**
 * Chrome for the Active Space: getActiveSpace loads Viewer, Sections, and
 * ShareBar member preview in one layout query so nested section views can trust
 * the Space scope. The sidebar's Spaces list streams in via Suspense so that
 * query never blocks the layout. Credential access for the change-password
 * link comes from that layout load; the change-password page still enforces via
 * requireCredentialSession.
 */
export default async function SpaceRouteLayout({
  children,
  params,
}: SpaceRouteLayoutProps) {
  const spaceId = await resolveSpaceContext(params);
  const activeSpace = await getActiveSpace(spaceId);
  const { viewer, sections, members } = activeSpace;

  return (
    <ActiveSpaceProvider value={activeSpace}>
      <SpaceLayout
        user={{
          name: viewer.user.name,
          email: viewer.user.email,
        }}
        activeSpace={{ id: viewer.space.id, name: viewer.space.name }}
        spacesSlot={
          <Suspense fallback={<SidebarSpacesSkeleton />}>
            <SidebarSpaces userId={viewer.userId} />
          </Suspense>
        }
        navItems={buildSpaceNav(spaceId, sections)}
        canMutateContent={viewer.can.mutateContent}
        canChangePassword={viewer.can.changePassword}
        shareBarSlot={
          <ShareBarSlot
            spaceId={spaceId}
            members={members}
            canManageMembers={viewer.can.manageMembers}
          />
        }
      >
        {children}
      </SpaceLayout>
    </ActiveSpaceProvider>
  );
}
