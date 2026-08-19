import {
  apiErrorResponse,
  parseJsonBody,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { reorderCustomSections } from "@/lib/services/sections";

import {
  reorderSectionsBodySchema,
  sectionSpaceParamsSchema,
} from "../schema";

type ReorderSectionsRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function POST(
  request: Request,
  context: ReorderSectionsRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await context.params;
    const { spaceId } = validateInput(params, sectionSpaceParamsSchema);
    const body = await parseJsonBody(request, reorderSectionsBodySchema);
    const sections = await reorderCustomSections(getDb(), {
      userId: session.user.id,
      spaceId,
      sectionIds: body.sectionIds,
    });

    return Response.json(sections);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
