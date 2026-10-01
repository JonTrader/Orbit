import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { sendReminders } from "@/lib/inngest/send-reminders";

/** One scan or one Resend call per step. 60s is enough and leaves headroom under a longer platform ceiling. */
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendReminders],
});
