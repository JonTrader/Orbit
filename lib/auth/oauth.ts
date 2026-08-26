export type OAuthProviderId = "google" | "microsoft";

/**
 * OAuth providers are available only when both credentials are configured.
 * Keep this server-side so provider secrets never need to reach the browser.
 */
export function getConfiguredOAuthProviderIds(): OAuthProviderId[] {
  const providers: OAuthProviderId[] = [];

  if (
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim()
  ) {
    providers.push("google");
  }

  if (
    process.env.MICROSOFT_CLIENT_ID?.trim() &&
    process.env.MICROSOFT_CLIENT_SECRET?.trim()
  ) {
    providers.push("microsoft");
  }

  return providers;
}
