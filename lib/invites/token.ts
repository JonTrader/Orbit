import { createHash, randomBytes } from "node:crypto";

/** SHA-256 hex digest of a raw Invite bearer secret. */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Fresh 256-bit Invite bearer secret (base64url). */
export function newInviteBearerToken(): string {
  return randomBytes(32).toString("base64url");
}
