import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { createSpace, listSpaces } from "@/lib/services/spaces";

import { createSpaceBodySchema } from "./schema";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const spaces = await listSpaces(getDb(), session.user.id);
    return Response.json(spaces);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const body = await parseJsonBody(request, createSpaceBodySchema);
    const created = await createSpace(getDb(), {
      userId: session.user.id,
      name: body.name,
      timezone: body.timezone,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
