import {
  apiErrorResponse,
  parseJsonBody,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { inviteMember } from "@/lib/services/members";

import {
  createInviteBodySchema,
  inviteSpaceParamsSchema,
} from "./schema";

type InvitesRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function POST(
  request: Request,
  context: InvitesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = validateInput(
      await context.params,
      inviteSpaceParamsSchema,
    );
    const body = await parseJsonBody(request, createInviteBodySchema);
    const created = await inviteMember(getDb(), {
      userId: session.user.id,
      spaceId,
      email: body.email,
      role: body.role,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
