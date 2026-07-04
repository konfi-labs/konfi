import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export type OAuthTokenEndpointAuthMethod =
  | "client_secret_basic"
  | "client_secret_post"
  | "none";

export interface OAuthClient<TScope extends string> {
  clientId: string;
  clientIdIssuedAt: number;
  clientName?: string;
  clientSecretHash?: string;
  clientSecretExpiresAt?: number;
  grantTypes: string[];
  redirectUris: string[];
  responseTypes: string[];
  scopes: TScope[];
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
}

export interface OAuthSubject<TUser> {
  uid: string;
  user: TUser;
}

export interface OAuthAuthorizationCode<TScope extends string, TTimestamp> {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  createdAtMs: number;
  expiresAt: TTimestamp;
  expiresAtMs: number;
  redirectUri: string;
  resource: string;
  scopes: TScope[];
  subjectUid: string;
}

export interface VerifiedOAuthToken<TScope extends string> {
  clientId: string;
  expiresAtMs: number;
  jti: string;
  resource: string;
  scopes: TScope[];
  subjectUid: string;
}

export interface OAuthAccessToken<
  TScope extends string,
  TTimestamp,
> extends VerifiedOAuthToken<TScope> {
  createdAtMs: number;
  expiresAt: TTimestamp;
  revokedAtMs?: number;
}

export interface OAuthRefreshToken<TScope extends string, TTimestamp> {
  clientId: string;
  createdAtMs: number;
  expiresAt: TTimestamp;
  expiresAtMs: number;
  resource: string;
  revokedAtMs?: number;
  scopes: TScope[];
  subjectUid: string;
}

export interface OAuthStorage<TScope extends string, TTimestamp> {
  consumeAuthorizationCode(
    hash: string,
    validate: (
      code: OAuthAuthorizationCode<TScope, TTimestamp>,
    ) => Promise<void> | void,
  ): Promise<OAuthAuthorizationCode<TScope, TTimestamp>>;
  consumeRefreshToken(
    hash: string,
    validate: (
      token: OAuthRefreshToken<TScope, TTimestamp>,
    ) => Promise<void> | void,
  ): Promise<OAuthRefreshToken<TScope, TTimestamp>>;
  getAccessToken(
    hash: string,
  ): Promise<OAuthAccessToken<TScope, TTimestamp> | null>;
  getClient(clientId: string): Promise<OAuthClient<TScope> | null>;
  revokeToken(
    hash: string,
    clientId: string,
    revokedAtMs: number,
  ): Promise<void>;
  saveAuthorizationCode(
    hash: string,
    code: OAuthAuthorizationCode<TScope, TTimestamp>,
  ): Promise<void>;
  saveClient(client: OAuthClient<TScope>): Promise<void>;
  saveTokenPair(input: {
    accessHash: string;
    accessToken: OAuthAccessToken<TScope, TTimestamp>;
    refreshHash: string;
    refreshToken: OAuthRefreshToken<TScope, TTimestamp>;
  }): Promise<void>;
}

type MaybePromise<T> = T | Promise<T>;

export class McpOAuthCoreError extends Error {
  error: string;
  status: number;

  constructor(error: string, description: string, status: number = 400) {
    super(description);
    this.name = "McpOAuthCoreError";
    this.error = error;
    this.status = status;
  }
}

export interface McpOAuthConsentCopy {
  authorizeButtonLabel: string;
  brandLabel: string;
  cancelButtonLabel: string;
  clientLabel: string;
  description: string;
  eyebrow: string;
  heading: string;
  language: string;
  noScopesLabel: string;
  redirectHostLabel: string;
  redirectUriLabel: string;
  scopesHeading: string;
  scopesIntro: string;
  securityNote: string;
  securityNoteTitle: string;
  title: string;
}

export interface McpOAuthServerOptions<
  TScope extends string,
  TUser,
  TTimestamp,
> {
  accessTokenCacheMaxEntries?: number;
  accessTokenCacheTtlMs?: number;
  accessTokenTtlSeconds?: number;
  authorizationCodeTtlMs?: number;
  clientIdPrefix: string;
  consent: {
    copy?(input: {
      client: OAuthClient<TScope>;
      redirectHost: string;
      redirectUri: string;
      request: Request;
      scopes: readonly TScope[];
    }): MaybePromise<Partial<McpOAuthConsentCopy>>;
    description: string;
    heading: string;
    signingSecret?: string | (() => string | undefined);
    title: string;
  };
  defaultScopes: readonly TScope[];
  getAuthenticatedSubject(
    headers: Headers,
  ): Promise<OAuthSubject<TUser> | null>;
  isScope(value: string): value is TScope;
  loginRedirect(request: Request): URL;
  paths: {
    authorization: string;
    registration: string;
    resource: string;
    revocation: string;
    token: string;
  };
  refreshTokenTtlSeconds?: number;
  resourceMismatchDescription?: string;
  resolveGrantScopes?(input: {
    client: OAuthClient<TScope>;
    requestedScopes: TScope[];
    subject: OAuthSubject<TUser>;
  }): TScope[];
  resourceName: string;
  storage: OAuthStorage<TScope, TTimestamp>;
  supportedScopes: readonly TScope[];
  timestampFromMs(value: number): TTimestamp;
  validateRefreshToken?(
    token: OAuthRefreshToken<TScope, TTimestamp>,
    client: OAuthClient<TScope>,
  ): Promise<void> | void;
}

interface CachedVerifiedOAuthToken<TScope extends string> {
  cachedUntilMs: number;
  token: VerifiedOAuthToken<TScope>;
}

interface OAuthConsentTokenPayload {
  audience: "mcp-oauth-consent";
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAtMs: number;
  origin: string;
  redirectUri: string;
  requestedResource: string | null;
  responseType: string;
  scope: string;
  state: string | null;
}

const DEFAULT_AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const DEFAULT_ACCESS_TOKEN_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_ACCESS_TOKEN_CACHE_MAX_ENTRIES = 1000;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function tokenHash(token: string): string {
  return sha256Base64Url(token);
}

function hmacSha256Base64Url(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function readFirstHeaderValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

export function mcpOAuthRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = readFirstHeaderValue(
    request.headers.get("x-forwarded-host"),
  );
  const host =
    forwardedHost ?? readFirstHeaderValue(request.headers.get("host"));
  const forwardedProto = readFirstHeaderValue(
    request.headers.get("x-forwarded-proto"),
  )?.replace(/:$/, "");
  const protocol = forwardedProto ?? requestUrl.protocol.replace(/:$/, "");

  if (!host) {
    return requestUrl.origin;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return requestUrl.origin;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = readString(item);
        return text ? [text] : [];
      })
    : [];
}

function parseOAuthScopeList(value: string): string[] {
  return value
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function isSafeRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isLoopbackHost(parsed.hostname)
    ) {
      return true;
    }

    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function redirectUriMatches(requested: string, registered: string): boolean {
  if (requested === registered) {
    return true;
  }

  try {
    const requestedUrl = new URL(requested);
    const registeredUrl = new URL(registered);

    return (
      isLoopbackHost(requestedUrl.hostname) &&
      isLoopbackHost(registeredUrl.hostname) &&
      requestedUrl.protocol === registeredUrl.protocol &&
      requestedUrl.pathname === registeredUrl.pathname &&
      requestedUrl.search === registeredUrl.search
    );
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hiddenInput(name: string, value: string | null): string {
  return value === null
    ? ""
    : `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(
        value,
      )}" />`;
}

function readConsentTokenString(
  value: Record<string, unknown>,
  key: keyof OAuthConsentTokenPayload,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function parseConsentTokenPayload(
  encodedPayload: string,
): OAuthConsentTokenPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const value = parsed as Record<string, unknown>;
    const audience = value.audience;
    const expiresAtMs = value.expiresAtMs;
    const requestedResource = value.requestedResource;
    const state = value.state;

    if (
      audience !== "mcp-oauth-consent" ||
      typeof expiresAtMs !== "number" ||
      !Number.isFinite(expiresAtMs) ||
      (requestedResource !== null && typeof requestedResource !== "string") ||
      (state !== null && typeof state !== "string")
    ) {
      return null;
    }

    const clientId = readConsentTokenString(value, "clientId");
    const codeChallenge = readConsentTokenString(value, "codeChallenge");
    const codeChallengeMethod = readConsentTokenString(
      value,
      "codeChallengeMethod",
    );
    const origin = readConsentTokenString(value, "origin");
    const redirectUri = readConsentTokenString(value, "redirectUri");
    const responseType = readConsentTokenString(value, "responseType");
    const scope = readConsentTokenString(value, "scope");

    if (
      !clientId ||
      !codeChallenge ||
      !codeChallengeMethod ||
      !origin ||
      !redirectUri ||
      !responseType ||
      scope === undefined
    ) {
      return null;
    }

    return {
      audience,
      clientId,
      codeChallenge,
      codeChallengeMethod,
      expiresAtMs,
      origin,
      redirectUri,
      requestedResource,
      responseType,
      scope,
      state,
    };
  } catch {
    return null;
  }
}

function clientResponse<TScope extends string>(
  client: OAuthClient<TScope>,
  clientSecret?: string,
): Record<string, unknown> {
  return {
    client_id: client.clientId,
    client_id_issued_at: client.clientIdIssuedAt,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    ...(client.clientSecretExpiresAt !== undefined
      ? { client_secret_expires_at: client.clientSecretExpiresAt }
      : {}),
    ...(client.clientName ? { client_name: client.clientName } : {}),
    grant_types: client.grantTypes,
    redirect_uris: client.redirectUris,
    response_types: client.responseTypes,
    scope: client.scopes.join(" "),
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
  };
}

function readBasicClientAuth(headers: Headers):
  | {
      clientId: string;
      clientSecret: string;
    }
  | undefined {
  const authorization = headers.get("authorization");

  if (!authorization?.startsWith("Basic ")) {
    return undefined;
  }

  const decoded = Buffer.from(authorization.slice(6), "base64").toString(
    "utf8",
  );
  const separatorIndex = decoded.indexOf(":");

  return separatorIndex === -1
    ? undefined
    : {
        clientId: decoded.slice(0, separatorIndex),
        clientSecret: decoded.slice(separatorIndex + 1),
      };
}

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  return timingSafeEqualString(sha256Base64Url(codeVerifier), codeChallenge);
}

export function createMcpOAuthServer<TScope extends string, TUser, TTimestamp>(
  options: McpOAuthServerOptions<TScope, TUser, TTimestamp>,
) {
  const accessTokenCache = new Map<string, CachedVerifiedOAuthToken<TScope>>();
  const authorizationCodeTtlMs =
    options.authorizationCodeTtlMs ?? DEFAULT_AUTHORIZATION_CODE_TTL_MS;
  const accessTokenTtlSeconds =
    options.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const accessTokenCacheTtlMs =
    options.accessTokenCacheTtlMs ?? DEFAULT_ACCESS_TOKEN_CACHE_TTL_MS;
  const accessTokenCacheMaxEntries =
    options.accessTokenCacheMaxEntries ??
    DEFAULT_ACCESS_TOKEN_CACHE_MAX_ENTRIES;
  const refreshTokenTtlSeconds =
    options.refreshTokenTtlSeconds ?? DEFAULT_REFRESH_TOKEN_TTL_SECONDS;
  const resourceMismatchDescription =
    options.resourceMismatchDescription ??
    `OAuth resource must match ${options.resourceName}.`;

  function consentSigningSecret(): string | undefined {
    const secret =
      typeof options.consent.signingSecret === "function"
        ? options.consent.signingSecret()
        : options.consent.signingSecret;
    return secret?.trim() || undefined;
  }

  function resourceUrl(request: Request): URL {
    return new URL(options.paths.resource, mcpOAuthRequestOrigin(request));
  }

  function authorizationServerUrl(request: Request): URL {
    return new URL(options.paths.resource, mcpOAuthRequestOrigin(request));
  }

  function errorResponse(error: unknown): Response {
    if (error instanceof McpOAuthCoreError) {
      return Response.json(
        {
          error: error.error,
          error_description: error.message,
        },
        { status: error.status },
      );
    }

    throw error;
  }

  function readScopes(value: string | undefined): TScope[] {
    if (!value) {
      return [...options.defaultScopes];
    }

    const requestedScopeValues = parseOAuthScopeList(value);
    if (requestedScopeValues.length === 0) {
      return [...options.defaultScopes];
    }

    const invalidScope = requestedScopeValues.find(
      (scope) => !options.isScope(scope),
    );
    if (invalidScope) {
      throw new McpOAuthCoreError(
        "invalid_scope",
        `Unsupported OAuth scope: ${invalidScope}.`,
      );
    }

    return [...new Set(requestedScopeValues.filter(options.isScope))];
  }

  async function requireClient(clientId: string): Promise<OAuthClient<TScope>> {
    const client = await options.storage.getClient(clientId);
    if (!client) {
      throw new McpOAuthCoreError(
        "invalid_client",
        "Unknown OAuth client.",
        401,
      );
    }

    return client;
  }

  function requireRegisteredRedirectUri(
    client: OAuthClient<TScope>,
    redirectUri: string,
  ): void {
    if (
      !client.redirectUris.some((uri) => redirectUriMatches(redirectUri, uri))
    ) {
      throw new McpOAuthCoreError(
        "invalid_request",
        "redirect_uri is not registered for this client.",
      );
    }
  }

  async function resolveConsentCopy(input: {
    client: OAuthClient<TScope>;
    redirectHost: string;
    redirectUri: string;
    request: Request;
    scopes: readonly TScope[];
  }): Promise<McpOAuthConsentCopy> {
    const defaults: McpOAuthConsentCopy = {
      authorizeButtonLabel: "Authorize",
      brandLabel: "Konfi Admin",
      cancelButtonLabel: "Cancel",
      clientLabel: "Client",
      description: options.consent.description,
      eyebrow: "Secure OAuth authorization",
      heading: options.consent.heading,
      language: "en",
      noScopesLabel: "No scopes requested",
      redirectHostLabel: "Redirect host",
      redirectUriLabel: "Redirect URI",
      scopesHeading: "Requested scopes",
      scopesIntro: "Review the permissions this client will receive.",
      securityNote:
        "Only authorize clients you recognize. You can revoke access later.",
      securityNoteTitle: "Security check",
      title: options.consent.title,
    };
    const override = await options.consent.copy?.(input);

    return { ...defaults, ...override };
  }

  async function consentResponse(input: {
    client: OAuthClient<TScope>;
    codeChallenge: string;
    codeChallengeMethod: string;
    redirectUri: string;
    request: Request;
    requestedResource: string | null;
    responseType: string;
    scopes: TScope[];
    state: string | null;
  }): Promise<Response> {
    const url = new URL(input.request.url);
    const redirectUrl = new URL(input.redirectUri);
    const copy = await resolveConsentCopy({
      client: input.client,
      redirectHost: redirectUrl.host,
      redirectUri: input.redirectUri,
      request: input.request,
      scopes: input.scopes,
    });
    const clientName = input.client.clientName ?? input.client.clientId;
    const scopes = input.scopes.map(
      (scope) => `<li><code>${escapeHtml(scope)}</code></li>`,
    );
    const scopeList =
      scopes.length > 0
        ? scopes.join("")
        : `<li><span>${escapeHtml(copy.noScopesLabel)}</span></li>`;
    const consentToken = createConsentToken({
      clientId: input.client.clientId,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      redirectUri: input.redirectUri,
      request: input.request,
      requestedResource: input.requestedResource,
      responseType: input.responseType,
      scopes: input.scopes,
      state: input.state,
    });
    const body = `<!doctype html>
<html lang="${escapeHtml(copy.language)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --background: oklch(1 0 0);
        --foreground: oklch(0.145 0 0);
        --card: oklch(1 0 0);
        --primary: oklch(0.205 0 0);
        --primary-foreground: oklch(0.985 0 0);
        --muted: oklch(0.97 0 0);
        --muted-foreground: oklch(0.556 0 0);
        --border: oklch(0.922 0 0);
        --ring: oklch(0.708 0 0);
        --success: oklch(0.508 0.118 165.612);
        --success-muted: oklch(0.962 0.04 165.6);
        --shadow: 0 20px 60px oklch(0.145 0 0 / 0.09);
        --radius: 0.625rem;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(
            180deg,
            oklch(0.985 0 0) 0%,
            var(--background) 42%
          );
        color: var(--foreground);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      .shell {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 40px 16px;
      }

      .panel {
        width: min(100%, 940px);
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--card);
        box-shadow: var(--shadow);
      }

      .header {
        padding: 28px 32px 30px;
        border-bottom: 1px solid var(--border);
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 30px;
        color: var(--muted-foreground);
        font-size: 0.875rem;
        font-weight: 600;
      }

      .brand-identity {
        display: inline-flex;
        align-items: center;
        min-width: 0;
      }

      .protocol {
        flex: 0 0 auto;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--muted);
        color: var(--foreground);
        font-size: 0.75rem;
        font-weight: 700;
        line-height: 1;
        padding: 7px 10px;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
        gap: 32px;
        align-items: end;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted-foreground);
        font-size: 0.8125rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      h1,
      h2,
      p,
      dl,
      dd {
        margin: 0;
      }

      h1 {
        max-width: 15ch;
        font-size: 2.25rem;
        line-height: 1.06;
        letter-spacing: 0;
      }

      .description {
        max-width: 58ch;
        margin-top: 16px;
        color: var(--muted-foreground);
        font-size: 1rem;
        line-height: 1.6;
      }

      .client-summary {
        display: grid;
        gap: 8px;
        min-width: 0;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--muted);
        padding: 16px;
      }

      .client-summary span {
        color: var(--muted-foreground);
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      .client-summary strong {
        overflow-wrap: anywhere;
        font-size: 1.125rem;
        line-height: 1.25;
      }

      .client-summary small {
        overflow-wrap: anywhere;
        color: var(--muted-foreground);
        font-size: 0.8125rem;
        line-height: 1.4;
      }

      .content {
        display: grid;
        gap: 18px;
        padding: 24px 32px 32px;
      }

      .details {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .detail {
        min-width: 0;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--card);
        padding: 14px 16px;
      }

      .detail.redirect-uri {
        grid-column: 1 / -1;
      }

      dt {
        color: var(--muted-foreground);
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      dd {
        overflow-wrap: anywhere;
        margin-top: 6px;
        font-size: 0.9375rem;
        font-weight: 600;
        line-height: 1.35;
      }

      .scopes {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--card);
        padding: 18px;
      }

      .scopes-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 14px;
      }

      h2 {
        font-size: 1rem;
        line-height: 1.3;
      }

      .scopes-header p {
        max-width: 44ch;
        margin-top: 4px;
        color: var(--muted-foreground);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      ul {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        min-width: 0;
      }

      code,
      li span {
        display: inline-block;
        max-width: 100%;
        overflow-wrap: anywhere;
        border: 1px solid var(--border);
        border-radius: calc(var(--radius) - 2px);
        background: var(--muted);
        color: var(--foreground);
        font: 700 0.8125rem ui-monospace, SFMono-Regular, Consolas, monospace;
        padding: 7px 10px;
      }

      .note {
        display: grid;
        gap: 4px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--success-muted);
        box-shadow: inset 3px 0 0 var(--success);
        padding: 14px 16px;
      }

      .note strong {
        font-size: 0.875rem;
      }

      .note span {
        color: var(--muted-foreground);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        padding-top: 4px;
      }

      button,
      .cancel {
        min-height: 44px;
        border-radius: calc(var(--radius) - 2px);
        font: inherit;
        font-weight: 700;
      }

      button {
        border: 0;
        background: var(--primary);
        color: var(--primary-foreground);
        cursor: pointer;
        padding: 0 18px;
      }

      button:hover {
        background: var(--foreground);
      }

      button:focus-visible,
      .cancel:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }

      .cancel {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--muted-foreground);
        padding: 0 12px;
        text-decoration: none;
      }

      .cancel:hover {
        color: var(--foreground);
      }

      @media (max-width: 760px) {
        .shell {
          padding: 16px;
        }

        .header,
        .content {
          padding-inline: 20px;
        }

        .header {
          padding-top: 22px;
        }

        .brand,
        .hero {
          display: grid;
        }

        .brand {
          justify-content: stretch;
          margin-bottom: 24px;
        }

        .protocol {
          justify-self: start;
        }

        .hero,
        .details {
          grid-template-columns: 1fr;
        }

        .client-summary {
          padding: 14px;
        }

        .scopes-header {
          display: block;
        }

        h1 {
          font-size: 2rem;
        }

        button,
        .cancel {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel" aria-labelledby="oauth-consent-heading">
        <div class="header">
          <div class="brand" aria-label="${escapeHtml(copy.brandLabel)}">
            <span class="brand-identity">
              <span>${escapeHtml(copy.brandLabel)}</span>
            </span>
            <span class="protocol">OAuth</span>
          </div>
          <div class="hero">
            <div>
              <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
              <h1 id="oauth-consent-heading">${escapeHtml(copy.heading)}</h1>
              <p class="description">${escapeHtml(copy.description)}</p>
            </div>
            <div class="client-summary" aria-label="${escapeHtml(copy.clientLabel)}">
              <span>${escapeHtml(copy.clientLabel)}</span>
              <strong>${escapeHtml(clientName)}</strong>
              <small>${escapeHtml(redirectUrl.host)}</small>
            </div>
          </div>
        </div>
        <div class="content">
          <dl class="details">
            <div class="detail">
              <dt>${escapeHtml(copy.clientLabel)}</dt>
              <dd>${escapeHtml(clientName)}</dd>
            </div>
            <div class="detail">
              <dt>${escapeHtml(copy.redirectHostLabel)}</dt>
              <dd>${escapeHtml(redirectUrl.host)}</dd>
            </div>
            <div class="detail redirect-uri">
              <dt>${escapeHtml(copy.redirectUriLabel)}</dt>
              <dd>${escapeHtml(input.redirectUri)}</dd>
            </div>
          </dl>
          <section class="scopes" aria-labelledby="oauth-consent-scopes-heading">
            <div class="scopes-header">
              <div>
                <h2 id="oauth-consent-scopes-heading">${escapeHtml(copy.scopesHeading)}</h2>
                <p>${escapeHtml(copy.scopesIntro)}</p>
              </div>
            </div>
            <ul>${scopeList}</ul>
          </section>
          <p class="note">
            <strong>${escapeHtml(copy.securityNoteTitle)}</strong>
            <span>${escapeHtml(copy.securityNote)}</span>
          </p>
          <form method="post" action="${escapeHtml(url.pathname)}">
            ${hiddenInput("response_type", input.responseType)}
            ${hiddenInput("client_id", input.client.clientId)}
            ${hiddenInput("redirect_uri", input.redirectUri)}
            ${hiddenInput("code_challenge", input.codeChallenge)}
            ${hiddenInput("code_challenge_method", input.codeChallengeMethod)}
            ${hiddenInput("scope", input.scopes.join(" "))}
            ${hiddenInput("state", input.state)}
            ${hiddenInput("resource", input.requestedResource)}
            ${hiddenInput("mcp_oauth_consent_token", consentToken)}
            <input type="hidden" name="mcp_oauth_consent" value="allow" />
            <div class="actions">
              <button type="submit">${escapeHtml(copy.authorizeButtonLabel)}</button>
              <a class="cancel" href="/">${escapeHtml(copy.cancelButtonLabel)}</a>
            </div>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
      },
      status: 200,
    });
  }

  function createConsentToken(input: {
    clientId: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    redirectUri: string;
    request: Request;
    requestedResource: string | null;
    responseType: string;
    scopes: TScope[];
    state: string | null;
  }): string | null {
    const secret = consentSigningSecret();
    if (!secret) {
      return null;
    }

    const payload: OAuthConsentTokenPayload = {
      audience: "mcp-oauth-consent",
      clientId: input.clientId,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      expiresAtMs: Date.now() + authorizationCodeTtlMs,
      origin: mcpOAuthRequestOrigin(input.request),
      redirectUri: input.redirectUri,
      requestedResource: input.requestedResource,
      responseType: input.responseType,
      scope: input.scopes.join(" "),
      state: input.state,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signature = hmacSha256Base64Url(secret, encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  function isConsentTokenValid(
    request: Request,
    params: URLSearchParams,
  ): boolean {
    const secret = consentSigningSecret();
    const token = params.get("mcp_oauth_consent_token")?.trim();
    if (!secret || !token) {
      return false;
    }

    const [encodedPayload, signature, extra] = token.split(".");
    if (!encodedPayload || !signature || extra !== undefined) {
      return false;
    }

    const expectedSignature = hmacSha256Base64Url(secret, encodedPayload);
    if (!timingSafeEqualString(signature, expectedSignature)) {
      return false;
    }

    const payload = parseConsentTokenPayload(encodedPayload);
    if (!payload || payload.expiresAtMs <= Date.now()) {
      return false;
    }

    return (
      payload.origin === mcpOAuthRequestOrigin(request) &&
      payload.responseType === params.get("response_type") &&
      payload.clientId === params.get("client_id") &&
      payload.redirectUri === params.get("redirect_uri") &&
      payload.codeChallenge === params.get("code_challenge") &&
      payload.codeChallengeMethod === params.get("code_challenge_method") &&
      payload.scope === (params.get("scope") ?? "") &&
      payload.state === (params.get("state") ?? null) &&
      payload.requestedResource === (params.get("resource") ?? null)
    );
  }

  async function authenticateTokenClient(
    request: Request,
    formData: URLSearchParams,
  ): Promise<OAuthClient<TScope>> {
    const basicAuth = readBasicClientAuth(request.headers);
    const formClientId = formData.get("client_id")?.trim() ?? "";
    const clientId = basicAuth?.clientId ?? formClientId;

    if (!clientId) {
      throw new McpOAuthCoreError(
        "invalid_client",
        "client_id is required.",
        401,
      );
    }

    if (basicAuth && formClientId && basicAuth.clientId !== formClientId) {
      throw new McpOAuthCoreError(
        "invalid_client",
        "Client IDs do not match.",
        401,
      );
    }

    const client = await requireClient(clientId);
    if (client.tokenEndpointAuthMethod === "none") {
      if (basicAuth || formData.has("client_secret")) {
        throw new McpOAuthCoreError(
          "invalid_client",
          "Public clients must not authenticate with a client secret.",
          401,
        );
      }

      return client;
    }

    if (
      client.tokenEndpointAuthMethod === "client_secret_basic" &&
      !basicAuth
    ) {
      throw new McpOAuthCoreError(
        "invalid_client",
        "Client must authenticate with HTTP Basic.",
        401,
      );
    }

    if (client.tokenEndpointAuthMethod === "client_secret_post" && basicAuth) {
      throw new McpOAuthCoreError(
        "invalid_client",
        "Client must authenticate with request body credentials.",
        401,
      );
    }

    const clientSecret =
      client.tokenEndpointAuthMethod === "client_secret_basic"
        ? (basicAuth?.clientSecret ?? "")
        : (formData.get("client_secret") ?? "");

    if (
      !client.clientSecretHash ||
      !timingSafeEqualString(tokenHash(clientSecret), client.clientSecretHash)
    ) {
      throw new McpOAuthCoreError(
        "invalid_client",
        "Invalid client secret.",
        401,
      );
    }

    return client;
  }

  async function issueTokenPair(input: {
    clientId: string;
    resource: string;
    scopes: TScope[];
    subjectUid: string;
  }): Promise<Record<string, unknown>> {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const nowMs = Date.now();
    const expiresAtMs = nowMs + accessTokenTtlSeconds * 1000;
    const refreshExpiresAtMs = nowMs + refreshTokenTtlSeconds * 1000;

    await options.storage.saveTokenPair({
      accessHash: tokenHash(accessToken),
      accessToken: {
        clientId: input.clientId,
        createdAtMs: nowMs,
        expiresAt: options.timestampFromMs(expiresAtMs),
        expiresAtMs,
        jti: randomUUID(),
        resource: input.resource,
        scopes: input.scopes,
        subjectUid: input.subjectUid,
      },
      refreshHash: tokenHash(refreshToken),
      refreshToken: {
        clientId: input.clientId,
        createdAtMs: nowMs,
        expiresAt: options.timestampFromMs(refreshExpiresAtMs),
        expiresAtMs: refreshExpiresAtMs,
        resource: input.resource,
        scopes: input.scopes,
        subjectUid: input.subjectUid,
      },
    });

    return {
      access_token: accessToken,
      expires_in: accessTokenTtlSeconds,
      refresh_token: refreshToken,
      scope: input.scopes.join(" "),
      token_type: "Bearer",
    };
  }

  async function exchangeAuthorizationCode(
    request: Request,
    client: OAuthClient<TScope>,
    formData: URLSearchParams,
  ): Promise<Record<string, unknown>> {
    const code = formData.get("code")?.trim();
    const redirectUri = formData.get("redirect_uri")?.trim();
    const codeVerifier = formData.get("code_verifier")?.trim();

    if (!code || !redirectUri || !codeVerifier) {
      throw new McpOAuthCoreError(
        "invalid_request",
        "code, redirect_uri, and code_verifier are required.",
      );
    }

    const requestedResource = formData.get("resource")?.trim();
    const expectedResource = resourceUrl(request).href;
    const authorizationCode = await options.storage.consumeAuthorizationCode(
      tokenHash(code),
      (storedCode) => {
        if (
          storedCode.clientId !== client.clientId ||
          storedCode.redirectUri !== redirectUri ||
          storedCode.expiresAtMs <= Date.now() ||
          !verifyPkce(codeVerifier, storedCode.codeChallenge)
        ) {
          throw new McpOAuthCoreError(
            "invalid_grant",
            "Invalid authorization code.",
          );
        }

        if (
          (requestedResource && requestedResource !== storedCode.resource) ||
          storedCode.resource !== expectedResource
        ) {
          throw new McpOAuthCoreError(
            "invalid_target",
            resourceMismatchDescription,
          );
        }
      },
    );

    return issueTokenPair({
      clientId: client.clientId,
      resource: authorizationCode.resource,
      scopes: authorizationCode.scopes,
      subjectUid: authorizationCode.subjectUid,
    });
  }

  async function exchangeRefreshToken(
    client: OAuthClient<TScope>,
    formData: URLSearchParams,
  ): Promise<Record<string, unknown>> {
    const refreshToken = formData.get("refresh_token")?.trim();

    if (!refreshToken) {
      throw new McpOAuthCoreError(
        "invalid_request",
        "refresh_token is required.",
      );
    }

    const storedRefreshToken = await options.storage.consumeRefreshToken(
      tokenHash(refreshToken),
      async (storedToken) => {
        if (
          storedToken.clientId !== client.clientId ||
          storedToken.expiresAtMs <= Date.now() ||
          storedToken.revokedAtMs
        ) {
          throw new McpOAuthCoreError(
            "invalid_grant",
            "Invalid refresh token.",
          );
        }

        await options.validateRefreshToken?.(storedToken, client);
      },
    );

    return issueTokenPair({
      clientId: client.clientId,
      resource: storedRefreshToken.resource,
      scopes: storedRefreshToken.scopes,
      subjectUid: storedRefreshToken.subjectUid,
    });
  }

  function cleanupVerifiedAccessTokenCache(nowMs: number): void {
    for (const [hash, cached] of accessTokenCache) {
      if (cached.cachedUntilMs <= nowMs || cached.token.expiresAtMs <= nowMs) {
        accessTokenCache.delete(hash);
      }
    }
  }

  function readCachedVerifiedAccessToken(
    hash: string,
    nowMs: number,
  ): VerifiedOAuthToken<TScope> | null {
    cleanupVerifiedAccessTokenCache(nowMs);

    return accessTokenCache.get(hash)?.token ?? null;
  }

  function cacheVerifiedAccessToken(
    hash: string,
    token: VerifiedOAuthToken<TScope>,
    nowMs: number,
  ): void {
    if (accessTokenCache.size >= accessTokenCacheMaxEntries) {
      const firstKey = accessTokenCache.keys().next().value;

      if (firstKey) {
        accessTokenCache.delete(firstKey);
      }
    }

    accessTokenCache.set(hash, {
      cachedUntilMs: Math.min(nowMs + accessTokenCacheTtlMs, token.expiresAtMs),
      token,
    });
  }

  return {
    authorizationServerMetadata(request: Request) {
      const origin = mcpOAuthRequestOrigin(request);

      return {
        authorization_endpoint: new URL(options.paths.authorization, origin)
          .href,
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        issuer: authorizationServerUrl(request).href,
        registration_endpoint: new URL(options.paths.registration, origin).href,
        response_types_supported: ["code"],
        revocation_endpoint: new URL(options.paths.revocation, origin).href,
        scopes_supported: [...options.supportedScopes],
        token_endpoint: new URL(options.paths.token, origin).href,
        token_endpoint_auth_methods_supported: [
          "none",
          "client_secret_post",
          "client_secret_basic",
        ],
      };
    },
    async authorizeRequest(
      request: Request,
      authorizeOptions: {
        consentConfirmed?: boolean;
        params?: URLSearchParams;
      } = {},
    ): Promise<Response> {
      const url = new URL(request.url);
      const params = authorizeOptions.params ?? url.searchParams;
      const responseType = params.get("response_type");
      const clientId = params.get("client_id");
      const redirectUri = params.get("redirect_uri");
      const codeChallenge = params.get("code_challenge");
      const codeChallengeMethod = params.get("code_challenge_method");
      const state = params.get("state");

      if (
        responseType !== "code" ||
        !clientId ||
        !redirectUri ||
        !codeChallenge ||
        codeChallengeMethod !== "S256"
      ) {
        return Response.json(
          {
            error: "invalid_request",
            error_description:
              "response_type=code, client_id, redirect_uri, code_challenge, and code_challenge_method=S256 are required.",
          },
          { status: 400 },
        );
      }

      const client = await requireClient(clientId);
      requireRegisteredRedirectUri(client, redirectUri);

      const subject = await options.getAuthenticatedSubject(request.headers);
      if (!subject) {
        return Response.redirect(options.loginRedirect(request), 302);
      }

      const clientRequestedScopes = readScopes(
        params.get("scope") ?? undefined,
      ).filter((scope) => client.scopes.includes(scope));
      const requestedScopes =
        clientRequestedScopes.length > 0
          ? clientRequestedScopes
          : client.scopes;
      const scopes = options.resolveGrantScopes
        ? options.resolveGrantScopes({
            client,
            requestedScopes,
            subject,
          })
        : requestedScopes;

      if (scopes.length === 0) {
        return errorResponse(
          new McpOAuthCoreError(
            "invalid_scope",
            "The signed-in user is not allowed to grant the requested scopes.",
          ),
        );
      }

      const requestedResource = params.get("resource");
      if (!authorizeOptions.consentConfirmed) {
        return consentResponse({
          client,
          codeChallenge,
          codeChallengeMethod,
          redirectUri,
          request,
          requestedResource,
          responseType,
          scopes,
          state,
        });
      }

      const expectedResource = resourceUrl(request).href;
      if (requestedResource && requestedResource !== expectedResource) {
        return errorResponse(
          new McpOAuthCoreError("invalid_target", resourceMismatchDescription),
        );
      }

      const code = randomToken();
      const nowMs = Date.now();
      await options.storage.saveAuthorizationCode(tokenHash(code), {
        clientId,
        codeChallenge,
        codeChallengeMethod: "S256",
        createdAtMs: nowMs,
        expiresAt: options.timestampFromMs(nowMs + authorizationCodeTtlMs),
        expiresAtMs: nowMs + authorizationCodeTtlMs,
        redirectUri,
        resource: requestedResource ?? expectedResource,
        scopes,
        subjectUid: subject.uid,
      });

      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set("code", code);

      if (state) {
        redirectUrl.searchParams.set("state", state);
      }

      return Response.redirect(redirectUrl, 302);
    },
    errorResponse,
    isConsentTokenValid,
    async exchangeToken(request: Request): Promise<Record<string, unknown>> {
      const body = await request.text();
      const formData = new URLSearchParams(body);
      const grantType = formData.get("grant_type");
      const client = await authenticateTokenClient(request, formData);

      if (grantType === "authorization_code") {
        return exchangeAuthorizationCode(request, client, formData);
      }

      if (grantType === "refresh_token") {
        return exchangeRefreshToken(client, formData);
      }

      throw new McpOAuthCoreError(
        "unsupported_grant_type",
        "Unsupported grant_type.",
      );
    },
    protectedResourceMetadata(request: Request) {
      const origin = mcpOAuthRequestOrigin(request);

      return {
        authorization_servers: [authorizationServerUrl(request).href],
        bearer_methods_supported: ["header"],
        resource: new URL(options.paths.resource, origin).href,
        resource_name: options.resourceName,
        scopes_supported: [...options.supportedScopes],
      };
    },
    async registerClient(body: unknown): Promise<Record<string, unknown>> {
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new McpOAuthCoreError(
          "invalid_client_metadata",
          "Expected JSON object.",
        );
      }

      const data = body as Record<string, unknown>;
      const redirectUris = readStringArray(data.redirect_uris);
      if (redirectUris.length === 0 || !redirectUris.every(isSafeRedirectUri)) {
        throw new McpOAuthCoreError(
          "invalid_redirect_uri",
          "At least one safe redirect_uri is required.",
        );
      }

      const requestedAuthMethod =
        readString(data.token_endpoint_auth_method) ?? "none";
      if (
        requestedAuthMethod !== "client_secret_basic" &&
        requestedAuthMethod !== "client_secret_post" &&
        requestedAuthMethod !== "none"
      ) {
        throw new McpOAuthCoreError(
          "invalid_client_metadata",
          "Unsupported token_endpoint_auth_method.",
        );
      }

      const tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod =
        requestedAuthMethod;
      const clientSecret =
        tokenEndpointAuthMethod === "none" ? undefined : randomToken();
      const clientName = readString(data.client_name);
      const client: OAuthClient<TScope> = {
        clientId: `${options.clientIdPrefix}${randomToken()}`,
        clientIdIssuedAt: nowSeconds(),
        ...(clientName ? { clientName } : {}),
        ...(clientSecret
          ? {
              clientSecretExpiresAt: 0,
              clientSecretHash: tokenHash(clientSecret),
            }
          : {}),
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris,
        responseTypes: ["code"],
        scopes: readScopes(readString(data.scope)),
        tokenEndpointAuthMethod,
      };

      await options.storage.saveClient(client);

      return clientResponse(client, clientSecret);
    },
    resourceUrl,
    async revokeToken(request: Request): Promise<void> {
      const body = await request.text();
      const formData = new URLSearchParams(body);
      const client = await authenticateTokenClient(request, formData);
      const token = formData.get("token")?.trim();

      if (!token) {
        throw new McpOAuthCoreError("invalid_request", "token is required.");
      }

      const hash = tokenHash(token);
      accessTokenCache.delete(hash);
      await options.storage.revokeToken(hash, client.clientId, Date.now());
    },
    async verifyAccessToken(
      token: string,
    ): Promise<VerifiedOAuthToken<TScope> | null> {
      const hash = tokenHash(token);
      const nowMs = Date.now();
      const cachedToken = readCachedVerifiedAccessToken(hash, nowMs);

      if (cachedToken) {
        return cachedToken;
      }

      const storedToken = await options.storage.getAccessToken(hash);
      if (
        !storedToken ||
        storedToken.expiresAtMs <= nowMs ||
        storedToken.revokedAtMs
      ) {
        return null;
      }

      cacheVerifiedAccessToken(hash, storedToken, nowMs);

      return storedToken;
    },
  };
}
