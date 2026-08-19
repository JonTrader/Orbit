import {
  apiErrorResponse,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { completeTask } from "@/lib/services/tasks";

import { taskIdParamsSchema } from "../../schema";

type CompleteTaskRouteContext = {
  params: Promise<{ spaceId: string; taskId: string }>;
};

export async function POST(
  request: Request,
  context: CompleteTaskRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = validateInput(await context.params, taskIdParamsSchema);
    const completed = await completeTask(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      taskId: params.taskId,
    });

    return Response.json(completed);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
