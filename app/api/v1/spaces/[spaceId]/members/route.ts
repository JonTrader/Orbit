import {
  apiErrorResponse,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { listMembers } from "@/lib/services/members";

import { memberSpaceParamsSchema } from "./schema";

type MembersRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: MembersRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = validateInput(
      await context.params,
      memberSpaceParamsSchema,
    );
    const members = await listMembers(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return Response.json(members);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
