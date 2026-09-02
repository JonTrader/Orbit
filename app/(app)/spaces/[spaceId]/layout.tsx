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
 * Chrome for the Active Space: the Viewer is resolved here once, so every
 * nested section view can trust the Space scope and focus on its content.
 * The sidebar's Spaces list streams in via a Suspense slot so its query never
 * blocks the layout. Credential access for the change-password link is batched
 * in the Viewer; the change-password page still enforces via
 * requireCredentialSession.
 */
export default async function SpaceRouteLayout({
  children,
  params,
}: SpaceRouteLayoutProps) {
  const spaceId = await resolveSpaceContext(params);
  const activeSpace = await getActiveSpace(spaceId);
  const { viewer, sections } = activeSpace;

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
          <Suspense fallback={null}>
            <ShareBarSlot
              userId={viewer.userId}
              spaceId={spaceId}
              canManageMembers={viewer.can.manageMembers}
            />
          </Suspense>
        }
      >
        {children}
      </SpaceLayout>
    </ActiveSpaceProvider>
  );
}
