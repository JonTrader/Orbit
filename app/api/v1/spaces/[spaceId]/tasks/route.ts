import {
  apiErrorResponse,
  parseJsonBody,
  parseSearchParams,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { createTask, listTasks } from "@/lib/services/tasks";

import {
  createTaskBodySchema,
  listTasksQuerySchema,
  taskSpaceParamsSchema,
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
    const spaceId = await readSpaceId(context);
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
    const spaceId = await readSpaceId(context);
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

async function readSpaceId(context: TasksRouteContext): Promise<string> {
  return validateInput(await context.params, taskSpaceParamsSchema).spaceId;
}
