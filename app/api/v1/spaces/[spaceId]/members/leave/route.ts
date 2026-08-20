import {
  apiErrorResponse,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { leaveSpace } from "@/lib/services/members";

import { memberSpaceParamsSchema } from "../schema";

type LeaveSpaceRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function POST(
  request: Request,
  context: LeaveSpaceRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = validateInput(
      await context.params,
      memberSpaceParamsSchema,
    );
    await leaveSpace(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
