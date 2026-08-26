import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { resendInvite } from "@/lib/services/members";

import { inviteIdParamsSchema } from "../../schema";

type ResendInviteRouteContext = {
  params: Promise<{ inviteId: string }>;
};

export async function POST(
  request: Request,
  context: ResendInviteRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { inviteId } = await readRouteParams(context, inviteIdParamsSchema);
    const resent = await resendInvite(getDb(), {
      userId: session.user.id,
      inviteId,
    });

    return Response.json(resent);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
