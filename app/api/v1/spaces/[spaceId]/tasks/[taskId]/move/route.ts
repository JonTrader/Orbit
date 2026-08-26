import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { moveTask } from "@/lib/services/tasks";

import {
  moveTaskBodySchema,
  taskIdParamsSchema,
} from "../../schema";

type MoveTaskRouteContext = {
  params: Promise<{ spaceId: string; taskId: string }>;
};

export async function POST(
  request: Request,
  context: MoveTaskRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, taskIdParamsSchema);
    const body = await parseJsonBody(request, moveTaskBodySchema);
    const moved = await moveTask(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      taskId: params.taskId,
      targetSectionId: body.targetSectionId,
    });

    return Response.json(moved);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
