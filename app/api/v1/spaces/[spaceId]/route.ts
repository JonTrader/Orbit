import {
  apiErrorResponse,
  parseJsonBody,
  readRouteParams,
  requireApiSession,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  deleteSpace,
  getSpace,
  updateSpaceTimezone,
} from "@/lib/services/spaces";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";
import { updateSpaceBodySchema } from "../schema";

type SpaceRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: SpaceRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const currentSpace = await getSpace(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return Response.json(currentSpace);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: SpaceRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const body = await parseJsonBody(request, updateSpaceBodySchema);
    const updated = await updateSpaceTimezone(getDb(), {
      userId: session.user.id,
      spaceId,
      timezone: body.timezone,
    });

    return Response.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: SpaceRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    await deleteSpace(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
