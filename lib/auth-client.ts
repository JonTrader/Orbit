import { createAuthClient } from "better-auth/react";

/** Browser client; the base URL defaults to the current origin. */
export const authClient = createAuthClient();

/**
 * Better Auth turns HTTP errors into `{ error }`, but a request that never
 * completes - offline, DNS, aborted - rejects instead, so every call site has
 * to catch or the form stays disabled with nothing on screen.
 */
export const NETWORK_ERROR_MESSAGE =
  "Could not reach Orbit. Check your connection and try again.";
