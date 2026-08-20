import {
  apiErrorResponse,
  requireApiSession,
  validateInput,
} from "@/lib/api";
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
    const { inviteId } = validateInput(
      await context.params,
      inviteIdParamsSchema,
    );
    const resent = await resendInvite(getDb(), {
      userId: session.user.id,
      inviteId,
    });

    return Response.json(resent);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
