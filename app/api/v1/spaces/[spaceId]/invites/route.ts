import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { inviteMember, listPendingInvites } from "@/lib/services/members";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";
import { createInviteBodySchema } from "./schema";

type InvitesRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: InvitesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const pending = await listPendingInvites(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return Response.json(pending);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: InvitesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
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
