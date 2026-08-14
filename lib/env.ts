/**
 * Environment access for server modules that cannot work without their config.
 *
 * `next build` evaluates every module with none of the runtime configuration
 * present, so the check has to hold off until something actually serves a
 * request; Next sets `NEXT_PHASE` for exactly this.
 */

const BUILD_PHASE = "phase-production-build";

/** A value long and odd enough that Better Auth accepts it during the build. */
const BUILD_PLACEHOLDER = "orbit-build-phase-placeholder-value";

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === BUILD_PHASE;
}

/** True only while serving production traffic, never while building it. */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" && !isBuildPhase();
}

export function requireEnv(
  name: string,
  buildFallback: string = BUILD_PLACEHOLDER,
): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isBuildPhase()) return buildFallback;

  throw new Error(
    `${name} is not set. Copy .env.example to .env and fill it in before ` +
      `starting the server.`,
  );
}
