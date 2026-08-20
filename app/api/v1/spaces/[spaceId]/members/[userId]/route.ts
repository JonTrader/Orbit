import {
  apiErrorResponse,
  parseJsonBody,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  removeMember,
  updateMemberRole,
} from "@/lib/services/members";

import {
  memberUserParamsSchema,
  updateMemberRoleBodySchema,
} from "../schema";

type MemberRouteContext = {
  params: Promise<{ spaceId: string; userId: string }>;
};

export async function PATCH(
  request: Request,
  context: MemberRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = validateInput(await context.params, memberUserParamsSchema);
    const body = await parseJsonBody(request, updateMemberRoleBodySchema);
    const updated = await updateMemberRole(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      targetUserId: params.userId,
      role: body.role,
    });

    return Response.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: MemberRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = validateInput(await context.params, memberUserParamsSchema);
    await removeMember(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      targetUserId: params.userId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
