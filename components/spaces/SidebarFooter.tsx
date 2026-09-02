import Link from "next/link";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";

export interface SidebarFooterUser {
  name: string;
  email: string;
}

interface SidebarFooterProps {
  user?: SidebarFooterUser;
  canChangePassword?: boolean;
}

export function SidebarFooter({
  user,
  canChangePassword = false,
}: SidebarFooterProps) {
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
          {canChangePassword ? (
            <Link
              href={CHANGE_PASSWORD_PATH}
              className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
            >
              Change password
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      ) : null}
    </div>
  );
}
