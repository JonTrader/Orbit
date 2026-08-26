import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import {
  deleteCustomSection,
  renameSection,
} from "@/lib/services/sections";

import {
  renameSectionBodySchema,
  sectionIdParamsSchema,
} from "../schema";

type SectionRouteContext = {
  params: Promise<{ spaceId: string; sectionId: string }>;
};

export async function PATCH(
  request: Request,
  context: SectionRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, sectionIdParamsSchema);
    const body = await parseJsonBody(request, renameSectionBodySchema);
    const updated = await renameSection(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      sectionId: params.sectionId,
      name: body.name,
    });

    return Response.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: SectionRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, sectionIdParamsSchema);
    await deleteCustomSection(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      sectionId: params.sectionId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
