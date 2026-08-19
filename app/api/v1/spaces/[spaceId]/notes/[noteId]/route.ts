import {
  apiErrorResponse,
  parseJsonBody,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  deleteNote,
  getNote,
  updateNote,
} from "@/lib/services/notes";

import {
  noteIdParamsSchema,
  updateNoteBodySchema,
} from "../schema";

type NoteRouteContext = {
  params: Promise<{ spaceId: string; noteId: string }>;
};

export async function GET(
  request: Request,
  context: NoteRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readParams(context);
    const currentNote = await getNote(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      noteId: params.noteId,
    });

    return Response.json(currentNote);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: NoteRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readParams(context);
    const body = await parseJsonBody(request, updateNoteBodySchema);
    const updated = await updateNote(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      noteId: params.noteId,
      title: body.title,
      body: body.body,
    });

    return Response.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: NoteRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const params = await readParams(context);
    await deleteNote(getDb(), {
      userId: session.user.id,
      spaceId: params.spaceId,
      noteId: params.noteId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function readParams(
  context: NoteRouteContext,
): Promise<{ spaceId: string; noteId: string }> {
  return validateInput(await context.params, noteIdParamsSchema);
}
