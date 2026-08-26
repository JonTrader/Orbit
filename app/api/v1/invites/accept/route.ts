import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { acceptInvite } from "@/lib/services/members";

import { acceptInviteBodySchema } from "../schema";

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const body = await parseJsonBody(request, acceptInviteBodySchema);
    const accepted = await acceptInvite(getDb(), {
      userId: session.user.id,
      token: body.token,
    });

    return Response.json(accepted, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
