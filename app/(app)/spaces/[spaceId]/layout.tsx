import { Suspense, type ReactNode } from "react";

import { PasswordLinkSlot } from "@/components/spaces/PasswordLinkSlot";
import { SidebarSpaces, SidebarSpacesSkeleton } from "@/components/spaces/SidebarSpaces";
import { SpaceLayout } from "@/components/spaces/SpaceLayout";
import { buildSpaceNav } from "@/lib/spaces/nav";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { getSpaceSections, getSpaceViewer } from "@/lib/spaces/viewer";

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
  const viewer = await getSpaceViewer(spaceId);
  const sections = await getSpaceSections(spaceId);

  return (
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
      passwordSlot={
        <Suspense fallback={null}>
          <PasswordLinkSlot userId={viewer.userId} />
        </Suspense>
      }
    >
      {children}
    </SpaceLayout>
  );
}
