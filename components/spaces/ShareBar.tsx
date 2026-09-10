"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { sendInvite } from "@/lib/actions/invites";
import {
  leaveSpace,
  listPendingInvites,
  removeMember,
  resendInvite,
  transferOwnership,
  updateMemberRole,
} from "@/lib/actions/members";
import type { InvitePublicView } from "@/lib/services/members";
import { SPACES_PATH } from "@/lib/spaces/paths";
import { roleLabel } from "@/lib/spaces/role-label";

import { ConfirmDialog } from "./ConfirmDialog";
import {
  Dialog,
  DialogField,
  DialogRadioPills,
  PanelDialog,
} from "./Dialog";
import { RowMenu } from "./RowMenu";

export interface ShareBarMember {
  userId: string;
  name: string;
  role: "owner" | "editor" | "read-only";
}

interface ShareBarProps {
  spaceId: string;
  members: ShareBarMember[];
  canManageMembers: boolean;
  /** Viewer's user id for Leave and self-labeling. */
  viewerUserId: string;
}

type ManageDialog =
  | { type: "people" }
  | { type: "invite" }
  | {
      type: "remove";
      member: ShareBarMember;
    }
  | {
      type: "transfer";
      member: ShareBarMember;
    }
  | { type: "leave" }
  | null;

const INVITE_ROLES = [
  { value: "read-only", label: "Read-only" },
  { value: "editor", label: "Editor" },
] as const;

type InviteRole = (typeof INVITE_ROLES)[number]["value"];

/**
 * Bottom-of-panel share surface for the Active Space. Shows member avatars,
 * opens a People dialog for everyone, and gives Owners invite / role /
 * transfer / remove controls. Pending Invites load via Server Action only
 * when the Owner opens People.
 */
export function ShareBar({
  spaceId,
  members,
  canManageMembers,
  viewerUserId,
}: ShareBarProps) {
  const [dialog, setDialog] = useState<ManageDialog>(null);
  const count = members.length;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel px-3.5 py-2.5">
      <button
        type="button"
        onClick={() => setDialog({ type: "people" })}
        className="flex min-w-0 items-center gap-3 rounded text-left transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`People in this Space, ${count} ${count === 1 ? "person" : "people"}`}
      >
        <div className="flex -space-x-2">
          {members.slice(0, 5).map((member) => (
            <Avatar key={member.userId} name={member.name} role={member.role} />
          ))}
        </div>
        <span className="text-[0.85rem] text-muted">
          {count} {count === 1 ? "person" : "people"}
        </span>
      </button>

      {canManageMembers ? (
        <button
          type="button"
          onClick={() => setDialog({ type: "invite" })}
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
      ) : null}

      {dialog?.type === "people" ? (
        <PeopleDialog
          spaceId={spaceId}
          members={members}
          canManageMembers={canManageMembers}
          viewerUserId={viewerUserId}
          onClose={() => setDialog(null)}
          onInvite={() => setDialog({ type: "invite" })}
          onRemove={(member) => setDialog({ type: "remove", member })}
          onTransfer={(member) => setDialog({ type: "transfer", member })}
          onLeave={() => setDialog({ type: "leave" })}
        />
      ) : null}

      {dialog?.type === "invite" ? (
        <InviteDialog
          spaceId={spaceId}
          onClose={() => setDialog({ type: "people" })}
        />
      ) : null}

      {dialog?.type === "remove" ? (
        <ConfirmDialog
          title="Remove Member"
          description={
            <>
              Remove {dialog.member.name} from this Space? They lose access
              immediately.
            </>
          }
          confirmLabel="Remove"
          pendingLabel="Removing…"
          onConfirm={() =>
            removeMember({
              spaceId,
              targetUserId: dialog.member.userId,
            })
          }
          onConfirmed={() => {}}
          onClose={() => setDialog({ type: "people" })}
        />
      ) : null}

      {dialog?.type === "transfer" ? (
        <ConfirmDialog
          title="Transfer ownership"
          description={
            <>
              Make {dialog.member.name} the Owner of this Space. You become an
              Editor afterward.
            </>
          }
          confirmLabel="Transfer ownership"
          pendingLabel="Transferring…"
          onConfirm={() =>
            transferOwnership({
              spaceId,
              targetUserId: dialog.member.userId,
            })
          }
          onConfirmed={() => {}}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.type === "leave" ? (
        <LeaveSpaceDialog
          spaceId={spaceId}
          onClose={() => setDialog({ type: "people" })}
        />
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

  return (
    <span
      title={`${name} · ${roleLabel(role)}`}
      aria-label={`${name}, ${roleLabel(role)}`}
      className="inline-flex size-8 items-center justify-center rounded-full border-2 border-panel bg-accent text-[0.7rem] font-semibold text-white"
    >
      {initials || "?"}
    </span>
  );
}

interface PeopleDialogProps {
  spaceId: string;
  members: ShareBarMember[];
  canManageMembers: boolean;
  viewerUserId: string;
  onClose: () => void;
  onInvite: () => void;
  onRemove: (member: ShareBarMember) => void;
  onTransfer: (member: ShareBarMember) => void;
  onLeave: () => void;
}

function PeopleDialog({
  spaceId,
  members,
  canManageMembers,
  viewerUserId,
  onClose,
  onInvite,
  onRemove,
  onTransfer,
  onLeave,
}: PeopleDialogProps) {
  const [pendingInvites, setPendingInvites] = useState<InvitePublicView[] | null>(
    null,
  );
  /** Wall clock when Invites last loaded; set outside render for purity. */
  const [invitesLoadedAtMs, setInvitesLoadedAtMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const viewer = members.find((member) => member.userId === viewerUserId);
  const canLeave = viewer !== undefined && viewer.role !== "owner";

  useEffect(() => {
    if (!canManageMembers) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await listPendingInvites({ spaceId });
      if (cancelled) return;
      if (result.ok) {
        setInvitesLoadedAtMs(Date.now());
        setPendingInvites(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
        setPendingInvites([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canManageMembers, spaceId]);

  function changeRole(member: ShareBarMember, role: InviteRole) {
    if (member.role === role) return;
    setActionError(null);
    startTransition(async () => {
      const result = await updateMemberRole({
        spaceId,
        targetUserId: member.userId,
        role,
      });
      if (!result.ok) {
        setActionError(result.error.message);
      }
    });
  }

  function onResend(inviteId: string) {
    setActionError(null);
    startTransition(async () => {
      const result = await resendInvite({ spaceId, inviteId });
      if (!result.ok) {
        setActionError(result.error.message);
        return;
      }
      setInvitesLoadedAtMs(Date.now());
      setPendingInvites((current) =>
        (current ?? []).map((row) => (row.id === inviteId ? result.data : row)),
      );
    });
  }

  return (
    <PanelDialog
      title="People"
      onClose={onClose}
      pending={pending}
      error={actionError ?? loadError}
      size="md"
    >
      <ul className="flex flex-col gap-2" aria-label="Members">
        {members.map((member) => {
          const isSelf = member.userId === viewerUserId;
          const isOwner = member.role === "owner";
          const menuItems =
            canManageMembers && !isOwner
              ? [
                  ...(member.role !== "editor"
                    ? [
                        {
                          label: "Make Editor",
                          onSelect: () => changeRole(member, "editor"),
                        },
                      ]
                    : []),
                  ...(member.role !== "read-only"
                    ? [
                        {
                          label: "Make Read-only",
                          onSelect: () => changeRole(member, "read-only"),
                        },
                      ]
                    : []),
                  {
                    label: "Transfer ownership",
                    onSelect: () => onTransfer(member),
                  },
                  {
                    label: "Remove",
                    onSelect: () => onRemove(member),
                    tone: "danger" as const,
                  },
                ]
              : [];

          return (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded border border-line bg-page px-3 py-2"
            >
              <Avatar name={member.name} role={member.role} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9rem] font-semibold text-ink">
                  {member.name}
                  {isSelf ? (
                    <span className="ml-1.5 text-[0.75rem] font-medium text-muted">
                      (you)
                    </span>
                  ) : null}
                </p>
                <p className="text-[0.75rem] text-muted">
                  {roleLabel(member.role)}
                </p>
              </div>
              {menuItems.length > 0 ? (
                <RowMenu
                  label={`Actions for ${member.name}`}
                  items={menuItems}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {canManageMembers ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Pending Invites
            </h3>
            <button
              type="button"
              onClick={onInvite}
              disabled={pending}
              className="text-[0.8rem] font-semibold text-ink hover:underline disabled:opacity-50"
            >
              Invite someone
            </button>
          </div>
          {pendingInvites === null ? (
            <p className="text-[0.85rem] text-muted" role="status">
              Loading Invites…
            </p>
          ) : pendingInvites.length === 0 ? (
            <p className="text-[0.85rem] text-muted">No pending Invites.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Pending Invites">
              {pendingInvites.map((pendingInvite) => {
                const expired =
                  new Date(pendingInvite.expiresAt).getTime() <=
                  invitesLoadedAtMs;
                return (
                  <li
                    key={pendingInvite.id}
                    className="flex items-center gap-3 rounded border border-line bg-page px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.9rem] font-semibold text-ink">
                        {pendingInvite.email}
                      </p>
                      <p className="text-[0.75rem] text-muted">
                        {roleLabel(pendingInvite.role as ShareBarMember["role"])}
                        {" · "}
                        {expired ? "Expired" : "Pending"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onResend(pendingInvite.id)}
                      className="shrink-0 rounded border border-line px-2.5 py-1 text-[0.8rem] font-semibold text-ink hover:border-muted disabled:opacity-50"
                    >
                      Resend
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {canLeave ? (
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            onClick={onLeave}
            disabled={pending}
            className="text-[0.85rem] font-semibold text-accent hover:underline disabled:opacity-50"
          >
            Leave Space
          </button>
        </div>
      ) : null}
    </PanelDialog>
  );
}

interface InviteDialogProps {
  spaceId: string;
  onClose: () => void;
}

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

function LeaveSpaceDialog({
  spaceId,
  onClose,
}: {
  spaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      title="Leave Space"
      description="You will lose access to this Space. You can be invited again later."
      confirmLabel="Leave"
      pendingLabel="Leaving…"
      onConfirm={() => leaveSpace({ spaceId })}
      onConfirmed={() => {
        router.replace(SPACES_PATH);
      }}
      onClose={onClose}
    />
  );
}
