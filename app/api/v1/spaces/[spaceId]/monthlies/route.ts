import {
  apiErrorResponse,
  parseJsonBody,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  createMonthly,
  listMonthlies,
} from "@/lib/services/monthlies";

import {
  createMonthlyBodySchema,
  monthlySpaceParamsSchema,
} from "./schema";

type MonthliesRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: MonthliesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const spaceId = await readSpaceId(context);
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
    const spaceId = await readSpaceId(context);
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

async function readSpaceId(context: MonthliesRouteContext): Promise<string> {
  return validateInput(await context.params, monthlySpaceParamsSchema).spaceId;
}
