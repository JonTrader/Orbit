import type { SpaceRole } from "@/lib/db/schema";

/**
 * Display label for a Space role. ShareBar and the Spaces directory pass
 * Owner, Editor, or Read-only; Invite email and accept-invite pass Editor or
 * Read-only only.
 */
export function roleLabel(role: SpaceRole): string {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Editor";
  return "Read-only";
}
