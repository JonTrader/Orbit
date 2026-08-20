import {
  apiErrorResponse,
  parseJsonBody,
  readRouteParams,
  requireApiSession,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  deleteMonthly,
  getMonthly,
  updateMonthly,
} from "@/lib/services/monthlies";

import {
  monthlyIdParamsSchema,
  updateMonthlyBodySchema,
} from "../schema";

type MonthlyRouteContext = {
  params: Promise<{ spaceId: string; monthlyId: string }>;
};

export async function GET(
  request: Request,
  context: MonthlyRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, monthlyIdParamsSchema);
    const currentMonthly = await getMonthly(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      monthlyId: params.monthlyId,
    });

    return Response.json(currentMonthly);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: MonthlyRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, monthlyIdParamsSchema);
    const body = await parseJsonBody(request, updateMonthlyBodySchema);
    const updated = await updateMonthly(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      monthlyId: params.monthlyId,
      title: body.title,
      dueDayOfMonth: body.dueDayOfMonth,
      assigneeId: body.assigneeId,
    });

    return Response.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: MonthlyRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, monthlyIdParamsSchema);
    await deleteMonthly(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      monthlyId: params.monthlyId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
