import { notFound } from "next/navigation";
import { z } from "zod";

export const spaceIdParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const customSectionParamsSchema = z
  .object({
    spaceId: z.uuid(),
    sectionId: z.uuid(),
  })
  .strict();

/**
 * Parses `[spaceId]` route params for every Space view. Accepts the params
 * promise or its awaited value; a malformed Space id is a 404, not an error.
 */
export async function resolveSpaceContext(params: unknown): Promise<string> {
  const parsed = spaceIdParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  return parsed.data.spaceId;
}

/**
 * Parses `[spaceId]/sections/[sectionId]` route params. Malformed ids are a
 * 404, matching the convention for every Space view.
 */
export async function resolveCustomSectionContext(
  params: unknown,
): Promise<{ spaceId: string; sectionId: string }> {
  const parsed = customSectionParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  return parsed.data;
}
