import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, parseSearchParams, readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { createTask, listTasks } from "@/lib/services/tasks";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";
import {
  createTaskBodySchema,
  listTasksQuerySchema,
} from "./schema";

type TasksRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: TasksRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const query = parseSearchParams(request, listTasksQuerySchema);
    const tasks = await listTasks(getDb(), {
      userId: session.user.id,
      spaceId,
      sectionId: query.sectionId,
    });

    return Response.json(tasks);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: TasksRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const body = await parseJsonBody(request, createTaskBodySchema);
    const created = await createTask(getDb(), {
      userId: session.user.id,
      spaceId,
      sectionId: body.sectionId,
      title: body.title,
      dueOn: body.dueOn,
      assigneeId: body.assigneeId,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
