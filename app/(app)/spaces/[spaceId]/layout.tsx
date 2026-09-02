import { Suspense, type ReactNode } from "react";

import { ActiveSpaceProvider } from "@/components/spaces/ActiveSpaceProvider";
import { PasswordLinkSlot } from "@/components/spaces/PasswordLinkSlot";
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
 * The sidebar's Spaces list and password link stream in via Suspense slots
 * so their queries never block the layout.
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
        shareBarSlot={
          <Suspense fallback={null}>
            <ShareBarSlot
              userId={viewer.userId}
              spaceId={spaceId}
              canManageMembers={viewer.can.manageMembers}
            />
          </Suspense>
        }
        passwordSlot={
          <Suspense fallback={null}>
            <PasswordLinkSlot userId={viewer.userId} />
          </Suspense>
        }
      >
        {children}
      </SpaceLayout>
    </ActiveSpaceProvider>
  );
}
