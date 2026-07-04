import { ToolLayerError } from "./errors";
import type { ToolAuthContext, ToolScope } from "./types";

export function hasScope(auth: ToolAuthContext, scope: ToolScope): boolean {
  return (
    auth.permissions.scopes.includes(scope) ||
    auth.token?.scopes.includes(scope) === true
  );
}

export function requireScopes(
  auth: ToolAuthContext,
  requiredScopes: readonly ToolScope[],
) {
  const missingScopes = requiredScopes.filter(
    (scope) => !hasScope(auth, scope),
  );

  if (missingScopes.length > 0) {
    throw new ToolLayerError(
      "missing_scope",
      `Missing required scope: ${missingScopes.join(" ")}`,
      {
        requiredScopes: [...requiredScopes],
      },
    );
  }
}

export function requireAnyScope(
  auth: ToolAuthContext,
  allowedScopes: readonly ToolScope[],
) {
  if (allowedScopes.some((scope) => hasScope(auth, scope))) {
    return;
  }

  throw new ToolLayerError(
    "missing_scope",
    `Missing one of required scopes: ${allowedScopes.join(" ")}`,
    {
      requiredScopes: [...allowedScopes],
    },
  );
}

export function canAccessChannel(
  auth: ToolAuthContext,
  channelId: string,
): boolean {
  return (
    auth.permissions.isSuperAdmin ||
    (auth.permissions.isAdmin && auth.permissions.channelIds.length === 0) ||
    auth.permissions.channelIds.includes(channelId)
  );
}

export function requireChannelAccess(auth: ToolAuthContext, channelId: string) {
  if (!channelId.trim()) {
    throw new ToolLayerError(
      "validation_error",
      "A channelId is required for this tool.",
    );
  }

  if (!canAccessChannel(auth, channelId)) {
    throw new ToolLayerError(
      "channel_denied",
      "The authenticated actor cannot access this channel.",
    );
  }
}

export function normalizeLimit(
  limit: number | undefined,
  options: {
    defaultLimit: number;
    maximumLimit: number;
    minimumLimit?: number;
  },
): number {
  const minimumLimit = options.minimumLimit ?? 1;
  const candidate =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.trunc(limit)
      : options.defaultLimit;

  return Math.min(Math.max(candidate, minimumLimit), options.maximumLimit);
}

export function normalizePage(page: number | undefined): number {
  if (typeof page !== "number" || !Number.isFinite(page)) {
    return 0;
  }

  return Math.max(0, Math.trunc(page));
}
