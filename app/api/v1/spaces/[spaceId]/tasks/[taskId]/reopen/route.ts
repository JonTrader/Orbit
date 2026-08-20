import {
  apiErrorResponse,
  readRouteParams,
  requireApiSession,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { reopenTask } from "@/lib/services/tasks";

import { taskIdParamsSchema } from "../../schema";

type ReopenTaskRouteContext = {
  params: Promise<{ spaceId: string; taskId: string }>;
};

export async function POST(
  request: Request,
  context: ReopenTaskRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, taskIdParamsSchema);
    const reopened = await reopenTask(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      taskId: params.taskId,
    });

    return Response.json(reopened);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
