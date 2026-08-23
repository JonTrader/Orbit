import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { getDb, type OrbitDb } from "@/lib/db/client";
import { SPACE_LAYOUT_PATTERN } from "@/lib/space-paths";
import { requireVerifiedSession } from "@/lib/session";

import { toActionError, type ActionResult } from "./result";

/** What a Server Action handler may rely on per invocation. */
export interface ActionContext {
  userId: string;
  db: OrbitDb;
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
 * 4. Success refreshes the Space layout pattern before resolving ok.
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

      revalidatePath(SPACE_LAYOUT_PATTERN, "layout");
      return { ok: true, data };
    } catch (error) {
      return toActionError(error);
    }
  };
}
