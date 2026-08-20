import {
  apiErrorResponse,
  readRouteParams,
  requireApiSession,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { transferOwnership } from "@/lib/services/members";

import { memberUserParamsSchema } from "../../schema";

type TransferOwnershipRouteContext = {
  params: Promise<{ spaceId: string; userId: string }>;
};

export async function POST(
  request: Request,
  context: TransferOwnershipRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, memberUserParamsSchema);
    const transferred = await transferOwnership(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      targetUserId: params.userId,
    });

    return Response.json(transferred);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
