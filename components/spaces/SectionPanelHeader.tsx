"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteSection, renameSection } from "@/lib/actions/sections";
import { spaceSectionPath } from "@/lib/spaces/paths";

import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { RowMenu } from "./RowMenu";

interface SectionPanelHeaderProps {
  spaceId: string;
  sectionId: string;
  sectionName: string;
  /** Left-side meta line, e.g. "Errands · 2 open · 1 note". */
  meta: string;
  /** Whether the Viewer may rename or delete this Section. */
  canMutate: boolean;
}

type HeaderDialog = "rename" | "delete";

/**
 * Meta bar for a custom Section panel. When the Viewer can mutate, shows
 * Rename / Delete Section on the right via RowMenu.
 */
export function SectionPanelHeader({
  spaceId,
  sectionId,
  sectionName,
  meta,
  canMutate,
}: SectionPanelHeaderProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<HeaderDialog | null>(null);

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3.5">
        <div className="min-w-0 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
          {meta}
        </div>
        {canMutate ? (
          <RowMenu
            label={`Actions for ${sectionName}`}
            items={[
              {
                label: "Rename",
                onSelect: () => setDialog("rename"),
              },
              {
                label: "Delete Section",
                tone: "danger",
                onSelect: () => setDialog("delete"),
              },
            ]}
          />
        ) : null}
      </div>

      {dialog === "rename" ? (
        <RenameDialog
          title="Rename Section"
          label="Name"
          initialName={sectionName}
          onRename={(name) =>
            renameSection({
              spaceId,
              sectionId,
              name,
            })
          }
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "delete" ? (
        <ConfirmDialog
          title="Delete Section"
          description={
            <>
              Delete {sectionName}? Its Tasks and Notes are deleted with it.
              This cannot be undone.
            </>
          }
          onConfirm={() =>
            deleteSection({
              spaceId,
              sectionId,
            })
          }
          onConfirmed={() => {
            router.replace(spaceSectionPath(spaceId, "upcoming"));
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
