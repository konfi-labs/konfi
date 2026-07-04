/**
 * Microsoft Graph API Configuration
 */

export interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  scopes: string[];
}

const DEFAULT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
];

export function getMicrosoftConfig(): MicrosoftConfig {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId) {
    throw new Error("MICROSOFT_CLIENT_ID environment variable is required");
  }

  if (!clientSecret) {
    throw new Error("MICROSOFT_CLIENT_SECRET environment variable is required");
  }

  if (!redirectUri) {
    throw new Error("MICROSOFT_REDIRECT_URI environment variable is required");
  }

  const scopesEnv = process.env.MICROSOFT_SCOPES;
  const scopes = scopesEnv
    ? scopesEnv.split(",").map((s) => s.trim())
    : DEFAULT_SCOPES;

  return {
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    scopes,
  };
}

export function getAuthorityUrl(tenantId: string = "common"): string {
  return `https://login.microsoftonline.com/${tenantId}`;
}
