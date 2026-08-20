import {
  apiErrorResponse,
  readRouteParams,
  requireApiSession,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { leaveSpace } from "@/lib/services/members";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";

type LeaveSpaceRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function POST(
  request: Request,
  context: LeaveSpaceRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    await leaveSpace(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
