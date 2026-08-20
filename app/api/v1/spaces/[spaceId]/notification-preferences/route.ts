import {
  apiErrorResponse,
  parseJsonBody,
  requireApiSession,
  validateInput,
} from "@/lib/api";
import { getDb } from "@/lib/db/client";
import {
  getNotificationPreference,
  updateNotificationPreference,
} from "@/lib/services/notifications";

import {
  notificationPreferenceSpaceParamsSchema,
  updateNotificationPreferenceBodySchema,
} from "./schema";

type NotificationPreferenceRouteContext = {
  params: Promise<{ spaceId: string }>;
};

export async function GET(
  request: Request,
  context: NotificationPreferenceRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = validateInput(
      await context.params,
      notificationPreferenceSpaceParamsSchema,
    );
    const preference = await getNotificationPreference(getDb(), {
      userId: session.user.id,
      spaceId,
    });

    return Response.json(preference);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: NotificationPreferenceRouteContext,
): Promise<Response> {
  try {
    const session = await requireApiSession(request);
    const { spaceId } = validateInput(
      await context.params,
      notificationPreferenceSpaceParamsSchema,
    );
    const body = await parseJsonBody(
      request,
      updateNotificationPreferenceBodySchema,
    );
    const updated = await updateNotificationPreference(getDb(), {
      userId: session.user.id,
      spaceId,
      daysBefore: body.daysBefore,
      emailEnabled: body.emailEnabled,
    });

    return Response.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
