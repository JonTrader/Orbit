"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { listActivity, listEntityActivity } from "@/lib/actions/activity";
import type { ActivityCursor, ActivityEntry } from "@/lib/services/activity";

import {
  formatActivitySentence,
  formatActivityTimestamp,
} from "./activity-sentence";
import { useActiveSpace } from "./ActiveSpaceProvider";
import { PanelDialog } from "./Dialog";

interface ActivityListProps {
  entries: readonly ActivityEntry[];
  pending: boolean;
  /** Set when an older page exists. */
  nextCursor: ActivityCursor | null;
  onLoadEarlier: () => void;
  /** Accessible name for the list. */
  label?: string;
}

/**
 * Newest-first Activity rows shared by entity History and the Space Activity
 * dialog. Load failures render on the parent PanelDialog, matching People.
 */
export function ActivityList({
  entries,
  pending,
  nextCursor,
  onLoadEarlier,
  label = "Activity",
}: ActivityListProps) {
  const { viewer, members } = useActiveSpace();
  const timeZone = viewer.space.timezone;

  return (
    <div>
      {entries.length === 0 ? (
        <p className="text-[0.85rem] text-muted" role="status">
          {pending ? "Loading activity…" : "No activity yet."}
        </p>
      ) : (
        <ul className="flex flex-col" aria-label={label}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-b border-line py-2.5 last:border-b-0"
            >
              <p className="text-[0.85rem] leading-snug text-ink">
                {formatActivitySentence(entry, members)}
              </p>
              <time
                dateTime={entry.createdAt}
                className="mt-1 block text-[0.75rem] text-muted"
              >
                {formatActivityTimestamp(entry.createdAt, timeZone)}
              </time>
            </li>
          ))}
        </ul>
      )}
      {nextCursor ? (
        <button
          type="button"
          onClick={onLoadEarlier}
          disabled={pending}
          className="mt-3 rounded border border-line bg-page px-3 py-1.5 text-[0.8rem] font-semibold text-ink transition-colors hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          Load earlier
        </button>
      ) : null}
    </div>
  );
}

type ActivityScope =
  | { kind: "space"; spaceId: string }
  | {
      kind: "entity";
      spaceId: string;
      entityType: "task" | "monthly";
      entityId: string;
    };

/**
 * Read-only Activity panel. Mounted only while open, so closing and reopening
 * loads a fresh page. It does not subscribe to later writes.
 */
function ActivityDialog({
  title,
  listLabel,
  size = "sm",
  scope,
  onClose,
}: {
  title: string;
  listLabel: string;
  size?: "sm" | "md";
  scope: ActivityScope;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<ActivityCursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const generation = useRef(0);
  const spaceId = scope.spaceId;
  const entityType = scope.kind === "entity" ? scope.entityType : undefined;
  const entityId = scope.kind === "entity" ? scope.entityId : undefined;

  const requestPage = useCallback(
    (cursor?: ActivityCursor) => {
      if (entityType && entityId) {
        return listEntityActivity(
          cursor
            ? { spaceId, entityType, entityId, cursor }
            : { spaceId, entityType, entityId },
        );
      }
      return listActivity(cursor ? { spaceId, cursor } : { spaceId });
    },
    [entityId, entityType, spaceId],
  );

  useEffect(() => {
    const generationId = ++generation.current;
    let cancelled = false;
    startTransition(async () => {
      const result = await requestPage();
      if (cancelled || generation.current !== generationId) return;
      if (result.ok) {
        setEntries(result.data.entries);
        setNextCursor(result.data.nextCursor);
        setError(null);
      } else {
        setEntries(null);
        setNextCursor(null);
        setError(result.error.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [requestPage]);

  function loadEarlier() {
    if (!nextCursor || pending) return;
    const cursor = nextCursor;
    const generationId = generation.current;
    startTransition(async () => {
      const result = await requestPage(cursor);
      if (generation.current !== generationId) return;
      if (result.ok) {
        setEntries((current) => [...(current ?? []), ...result.data.entries]);
        setNextCursor(result.data.nextCursor);
        setError(null);
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <PanelDialog title={title} onClose={onClose} error={error} size={size}>
      {entries === null && error ? null : (
        <ActivityList
          label={listLabel}
          entries={entries ?? []}
          pending={entries === null || pending}
          nextCursor={entries ? nextCursor : null}
          onLoadEarlier={loadEarlier}
        />
      )}
    </PanelDialog>
  );
}

/** One Task or Monthly's History. Own transition, separate from the row's. */
export function EntityHistoryDialog({
  spaceId,
  entityType,
  entityId,
  onClose,
}: {
  spaceId: string;
  entityType: "task" | "monthly";
  entityId: string;
  onClose: () => void;
}) {
  return (
    <ActivityDialog
      key={`${spaceId}:${entityType}:${entityId}`}
      title="History"
      listLabel="History"
      scope={{ kind: "entity", spaceId, entityType, entityId }}
      onClose={onClose}
    />
  );
}

/** Space-wide Activity. Wider panel so sentences can wrap on one line. */
export function SpaceActivityDialog({
  spaceId,
  onClose,
}: {
  spaceId: string;
  onClose: () => void;
}) {
  return (
    <ActivityDialog
      key={spaceId}
      title="Activity"
      listLabel="Activity"
      size="md"
      scope={{ kind: "space", spaceId }}
      onClose={onClose}
    />
  );
}
