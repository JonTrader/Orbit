import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { getDb, type OrbitDb } from "@/lib/db/client";
import { spaceLayoutPath, SPACES_PATH } from "@/lib/spaces/paths";
import { requireVerifiedSession } from "@/lib/auth/session";

import { toActionError, type ActionResult } from "./result";

/** What a Server Action handler may rely on per invocation. */
export interface ActionContext {
  userId: string;
  db: OrbitDb;
}

/**
 * The revalidation scope for one action run. Schemas with `spaceId` refresh
 * only that Space's layout tree. Schemas without (e.g. create-Space) refresh
 * the `/spaces` layout tree so the directory and nested Space sidebars update.
 */
function revalidateTarget(parsed: unknown): string {
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "spaceId" in parsed &&
    typeof parsed.spaceId === "string"
  ) {
    return spaceLayoutPath(parsed.spaceId);
  }
  return SPACES_PATH;
}

/**
 * Wraps one Server Action handler in the standard frame so actions carry
 * only their schema and their service calls.
 *
 * Order is load-bearing and structural, not conventional:
 * 1. The verified-session guard runs OUTSIDE the try/catch, so its redirect
 *    for unauthenticated or unverified callers propagates as a real redirect
 *    instead of being masked into an action error payload.
 * 2. The schema parses input; Zod failures become VALIDATION_ERROR results.
 * 3. The handler runs with the verified userId and the application db.
 * 4. Success refreshes the acting Space layout (or `/spaces` when unscoped)
 *    before resolving ok.
 * 5. Anything thrown maps through toActionError: DomainErrors keep their
 *    code and message, unexpected errors are logged and masked.
 */
export function defineAction<TSchema extends z.ZodType, TData>(
  schema: TSchema,
  handler: (input: z.output<TSchema>, ctx: ActionContext) => Promise<TData>,
): (input: unknown) => Promise<ActionResult<TData>> {
  return async (input) => {
    const session = await requireVerifiedSession();

    try {
      const parsed = schema.parse(input);
      const data = await handler(parsed, {
        userId: session.user.id,
        db: getDb(),
      });

      revalidatePath(revalidateTarget(parsed), "layout");
      return { ok: true, data };
    } catch (error) {
      return toActionError(error);
    }
  };
}
