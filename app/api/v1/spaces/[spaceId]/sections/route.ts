import {
  apiErrorResponse,
  parseJsonBody,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  createCustomSection,
  listSections,
} from "@/lib/services/sections";

import {
  createSectionBodySchema,
  sectionSpaceParamsSchema,
} from "./schema";

type SectionsRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: SectionsRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const spaceId = await readSpaceId(context);
    const sections = await listSections(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return Response.json(sections);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: SectionsRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const spaceId = await readSpaceId(context);
    const body = await parseJsonBody(request, createSectionBodySchema);
    const created = await createCustomSection(getDb(), {
      userId: session.user.id,
      spaceId,
      name: body.name,
      kind: body.kind,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function readSpaceId(context: SectionsRouteContext): Promise<string> {
  const params = await context.params;
  return validateInput(params, sectionSpaceParamsSchema).spaceId;
}
