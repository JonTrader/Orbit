import { getDb } from "@/lib/db/client";
import {
  scanReminderCandidates,
  sendReminder,
} from "@/lib/services/notifications";

import { inngest } from "./client";

/**
 * Hourly UTC scan. The Space timezone is applied inside the scan, and each
 * candidate is its own step so a failed send retries that send only.
 */
export const sendReminders = inngest.createFunction(
  { id: "send-reminders", triggers: { cron: "0 * * * *" } },
  async ({ step }) => {
    const candidates = await step.run("scan", () =>
      scanReminderCandidates(getDb(), { now: new Date() }),
    );

    for (const candidate of candidates) {
      const idempotencyKey = `${candidate.kind}:${candidate.entityId}:${candidate.period}`;
      await step.run(idempotencyKey, async () => {
        await sendReminder(getDb(), { candidate });
        // The log row has Date fields and must not cross this step boundary.
        return { idempotencyKey };
      });
    }

    return { scanned: candidates.length };
  },
);
