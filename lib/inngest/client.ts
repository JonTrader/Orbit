import { Inngest } from "inngest";

/** Checkpoint a third under the serve route's 60s maxDuration. */
export const inngest = new Inngest({
  id: "orbit",
  checkpointing: { maxRuntime: "40s" },
});
