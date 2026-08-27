import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";

export interface SidebarFooterUser {
  name: string;
  email: string;
}

interface SidebarFooterProps {
  user?: SidebarFooterUser;
  /**
   * Pre-rendered slot from the server layout (the streamed "Change password"
   * link). Passed as a prop because this component sits inside a client tree.
   */
  passwordSlot?: ReactNode;
}

export function SidebarFooter({ user, passwordSlot }: SidebarFooterProps) {
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-line px-1.5 pt-3">
      <button
        type="button"
        className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
      >
        Browse all Spaces
      </button>
      <button
        type="button"
        className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
      >
        New Space…
      </button>
      {user ? (
        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          <div className="px-2 text-[0.78rem] font-medium">{user.name}</div>
          <div className="truncate px-2 font-mono text-[0.62rem] text-muted">
            {user.email}
          </div>
          {passwordSlot}
          <SignOutButton />
        </div>
      ) : null}
    </div>
  );
}
