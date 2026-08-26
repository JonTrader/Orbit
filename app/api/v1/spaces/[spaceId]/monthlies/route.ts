import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import {
  createMonthly,
  listMonthlies,
} from "@/lib/services/monthlies";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";
import { createMonthlyBodySchema } from "./schema";

type MonthliesRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: MonthliesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const monthlies = await listMonthlies(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return Response.json(monthlies);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: MonthliesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const body = await parseJsonBody(request, createMonthlyBodySchema);
    const created = await createMonthly(getDb(), {
      userId: session.user.id,
      spaceId,
      title: body.title,
      dueDayOfMonth: body.dueDayOfMonth,
      assigneeId: body.assigneeId,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
