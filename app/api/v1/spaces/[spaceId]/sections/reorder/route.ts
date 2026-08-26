import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { reorderCustomSections } from "@/lib/services/sections";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";
import { reorderSectionsBodySchema } from "../schema";

type ReorderSectionsRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function POST(
  request: Request,
  context: ReorderSectionsRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
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
