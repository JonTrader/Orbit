import type { ReactNode } from "react";

import { ActiveSpaceProvider } from "@/components/spaces/ActiveSpaceProvider";
import { ShareBarSlot } from "@/components/spaces/ShareBarSlot";
import { SpaceLayout } from "@/components/spaces/SpaceLayout";
import { getActiveSpace } from "@/lib/spaces/active-space";
import { buildSpaceNav } from "@/lib/spaces/nav";
import { resolveSpaceContext } from "@/lib/spaces/params";

interface SpaceRouteLayoutProps {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}

/**
 * Chrome for one Active Space: getActiveSpace loads Viewer, Sections, and
 * ShareBar member preview in one layout query so nested section views can trust
 * the Space scope. The parent `(active)` layout owns SpaceSidebarShell so Space
 * switches do not remount the Spaces list. Credential access for the
 * change-password link is resolved there; the change-password page still
 * enforces via requireCredentialSession.
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
        activeSpace={{ id: viewer.space.id, name: viewer.space.name }}
        navItems={buildSpaceNav(spaceId, sections)}
        canMutateContent={viewer.can.mutateContent}
        shareBarSlot={
          <ShareBarSlot
            spaceId={spaceId}
            members={members}
            canManageMembers={viewer.can.manageMembers}
            viewerUserId={viewer.userId}
          />
        }
      >
        {children}
      </SpaceLayout>
    </ActiveSpaceProvider>
  );
}
