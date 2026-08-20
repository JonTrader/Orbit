import {
  apiErrorResponse,
  parseJsonBody,
  readRouteParams,
  requireApiSession,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  deleteTask,
  getTask,
  updateTask,
} from "@/lib/services/tasks";

import {
  taskIdParamsSchema,
  updateTaskBodySchema,
} from "../schema";

type TaskRouteContext = {
  params: Promise<{ spaceId: string; taskId: string }>;
};

export async function GET(
  request: Request,
  context: TaskRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, taskIdParamsSchema);
    const currentTask = await getTask(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      taskId: params.taskId,
    });

    return Response.json(currentTask);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: TaskRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, taskIdParamsSchema);
    const body = await parseJsonBody(request, updateTaskBodySchema);
    const updated = await updateTask(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      taskId: params.taskId,
      title: body.title,
      dueOn: body.dueOn,
      assigneeId: body.assigneeId,
    });

    return Response.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: TaskRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, taskIdParamsSchema);
    await deleteTask(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      taskId: params.taskId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
