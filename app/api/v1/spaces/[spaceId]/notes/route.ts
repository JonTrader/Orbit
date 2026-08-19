import {
  apiErrorResponse,
  parseJsonBody,
  parseSearchParams,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { createNote, listNotes } from "@/lib/services/notes";

import {
  createNoteBodySchema,
  listNotesQuerySchema,
  noteSpaceParamsSchema,
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
    const spaceId = await readSpaceId(context);
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
    const spaceId = await readSpaceId(context);
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

async function readSpaceId(context: NotesRouteContext): Promise<string> {
  return validateInput(await context.params, noteSpaceParamsSchema).spaceId;
}
