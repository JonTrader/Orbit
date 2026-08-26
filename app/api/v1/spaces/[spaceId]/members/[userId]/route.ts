import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, readRouteParams } from "@/lib/rest-api/validation";
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
    const params = await readRouteParams(context, memberUserParamsSchema);
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
    const params = await readRouteParams(context, memberUserParamsSchema);
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
