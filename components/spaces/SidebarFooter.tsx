"use client";

import Link from "next/link";
import { useState } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";
import { SPACES_DIRECTORY_PATH } from "@/lib/spaces/paths";

import { CreateSpaceDialog } from "./CreateSpaceDialog";

export interface SidebarFooterUser {
  name: string;
  email: string;
}

interface SidebarFooterProps {
  user?: SidebarFooterUser;
  canChangePassword?: boolean;
  /** Closes the mobile drawer when a nav link is activated. */
  onNavClick?: () => void;
}

const footerLinkClass =
  "rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink";

export function SidebarFooter({
  user,
  canChangePassword = false,
  onNavClick,
}: SidebarFooterProps) {
  const [createOpen, setCreateOpen] = useState(false);

  function openCreate() {
    onNavClick?.();
    setCreateOpen(true);
  }

  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-line px-1.5 pt-3">
      <Link
        href={SPACES_DIRECTORY_PATH}
        onClick={onNavClick}
        className={footerLinkClass}
      >
        Browse all Spaces
      </Link>
      <button type="button" onClick={openCreate} className={footerLinkClass}>
        New Space
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
              onClick={onNavClick}
              className={footerLinkClass}
            >
              Change password
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      ) : null}

      {createOpen ? (
        <CreateSpaceDialog onClose={() => setCreateOpen(false)} />
      ) : null}
    </div>
  );
}
