import {
  apiErrorResponse,
  readRouteParams,
  requireApiSession,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { completeMonthly } from "@/lib/services/monthlies";

import { monthlyIdParamsSchema } from "../../schema";

type CompleteMonthlyRouteContext = {
  params: Promise<{ spaceId: string; monthlyId: string }>;
};

export async function POST(
  request: Request,
  context: CompleteMonthlyRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readRouteParams(context, monthlyIdParamsSchema);
    const completed = await completeMonthly(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      monthlyId: params.monthlyId,
    });

    return Response.json(completed);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
