import { requireApiSession } from "@/lib/rest-api/auth";
import { apiErrorResponse } from "@/lib/rest-api/errors";
import { parseJsonBody, parseSearchParams, readRouteParams } from "@/lib/rest-api/validation";
import { getDb } from "@/lib/db/client";
import { createNote, listNotes } from "@/lib/services/notes";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";
import {
  createNoteBodySchema,
  listNotesQuerySchema,
} from "./schema";

type NotesRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: NotesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const query = parseSearchParams(request, listNotesQuerySchema);
    const notes = await listNotes(getDb(), {
      userId: session.user.id,
      spaceId,
      sectionId: query.sectionId,
    });

    return Response.json(notes);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: NotesRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = await readRouteParams(context, spaceIdParamsSchema);
    const body = await parseJsonBody(request, createNoteBodySchema);
    const created = await createNote(getDb(), {
      userId: session.user.id,
      spaceId,
      sectionId: body.sectionId,
      title: body.title,
      body: body.body,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
