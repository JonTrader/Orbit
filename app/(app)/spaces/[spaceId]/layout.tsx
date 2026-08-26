import type { ReactNode } from "react";

import { SpaceLayout } from "@/components/orbit/SpaceLayout";
import { hasCredentialAccount } from "@/lib/auth/access";
import { getDb } from "@/lib/db/client";
import { buildSpaceNav } from "@/lib/spaces/nav";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { getSpaceSections, getSpaceViewer } from "@/lib/spaces/viewer";
import { listSpaces } from "@/lib/services/spaces";

interface SpaceRouteLayoutProps {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}

/**
 * Chrome for the Active Space: the Viewer is resolved here once, so every
 * nested section view can trust the Space scope and focus on its content.
 */
export default async function SpaceRouteLayout({ children, params }: SpaceRouteLayoutProps) {
  const spaceId = await resolveSpaceContext(params);
  const viewer = await getSpaceViewer(spaceId);
  const db = getDb();

  const [spaces, sections, canChangePassword] = await Promise.all([
    listSpaces(db, viewer.userId),
    getSpaceSections(spaceId),
    hasCredentialAccount(db, viewer.userId),
  ]);

  return (
    <SpaceLayout
      user={{
        name: viewer.user.name,
        email: viewer.user.email,
        canChangePassword,
      }}
      activeSpace={{ id: viewer.space.id, name: viewer.space.name }}
      spaces={spaces.map((space) => ({ id: space.id, name: space.name }))}
      navItems={buildSpaceNav(spaceId, sections)}
    >
      {children}
    </SpaceLayout>
  );
}
