"use client";

import { useState, useTransition } from "react";

import { sendInvite } from "@/lib/actions/invites";

import { Dialog, DialogField, DialogRadioPills } from "./Dialog";

export interface ShareBarMember {
  userId: string;
  name: string;
  role: "owner" | "editor" | "read-only";
}

interface ShareBarProps {
  spaceId: string;
  members: ShareBarMember[];
  canManageMembers: boolean;
}

/**
 * Bottom-of-panel share surface for the Active Space. Shows member avatars
 * and an invite entry point for Owners. Editors and read-only Members see
 * the member list but cannot invite.
 */
export function ShareBar({ spaceId, members, canManageMembers }: ShareBarProps) {
  const [showInvite, setShowInvite] = useState(false);
  const count = members.length;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {members.slice(0, 5).map((member) => (
            <Avatar key={member.userId} name={member.name} role={member.role} />
          ))}
        </div>
        <span className="text-[0.85rem] text-muted">
          {count} {count === 1 ? "person" : "people"}
        </span>
      </div>

      {canManageMembers ? (
        <>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-[0.8rem] font-semibold text-white transition-colors hover:bg-ink/90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Invite
          </button>
          {showInvite ? (
            <InviteDialog
              spaceId={spaceId}
              onClose={() => setShowInvite(false)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Avatar({ name, role }: { name: string; role: ShareBarMember["role"] }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const roleLabel = role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Read-only";

  return (
    <span
      title={`${name} · ${roleLabel}`}
      className="inline-flex size-8 items-center justify-center rounded-full border-2 border-panel bg-accent text-[0.7rem] font-semibold text-white"
    >
      {initials || "?"}
    </span>
  );
}

interface InviteDialogProps {
  spaceId: string;
  onClose: () => void;
}

const INVITE_ROLES = [
  { value: "read-only", label: "Read-only" },
  { value: "editor", label: "Editor" },
] as const;

type InviteRole = (typeof INVITE_ROLES)[number]["value"];

function InviteDialog({ spaceId, onClose }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("read-only");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await sendInvite({
        spaceId,
        email: trimmed,
        role,
      });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog
      title="Invite to Space"
      onClose={onClose}
      pending={pending}
      error={error}
      submitLabel="Send invite"
      pendingLabel="Sending…"
      submitDisabled={!email.trim()}
      onSubmit={submit}
    >
      <DialogField label="Email" htmlFor="invite-email">
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="colleague@example.com"
          disabled={pending}
          autoFocus
          className="rounded border border-line bg-page px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60"
        />
      </DialogField>

      <DialogRadioPills
        name="invite-role"
        label="Role"
        value={role}
        options={INVITE_ROLES}
        onChange={setRole}
        disabled={pending}
      />
    </Dialog>
  );
}
