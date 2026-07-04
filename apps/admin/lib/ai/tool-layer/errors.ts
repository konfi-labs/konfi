import type { ToolScope } from "./types";

export type ToolLayerErrorCode =
  | "ambiguous_channel"
  | "channel_required"
  | "missing_scope"
  | "channel_denied"
  | "resource_denied"
  | "not_found"
  | "validation_error";

export class ToolLayerError extends Error {
  code: ToolLayerErrorCode;
  details?: Record<string, unknown>;
  requiredScopes?: ToolScope[];
  status: 400 | 403 | 404;

  constructor(
    code: ToolLayerErrorCode,
    message: string,
    options: {
      requiredScopes?: ToolScope[];
      details?: Record<string, unknown>;
      status?: 400 | 403 | 404;
    } = {},
  ) {
    super(message);
    this.name = "ToolLayerError";
    this.code = code;
    this.details = options.details;
    this.requiredScopes = options.requiredScopes;
    this.status =
      options.status ??
      (code === "not_found"
        ? 404
        : code === "validation_error" ||
            code === "channel_required" ||
            code === "ambiguous_channel"
          ? 400
          : 403);
  }
}

export function getToolLayerErrorCode(error: unknown): string {
  return error instanceof ToolLayerError ? error.code : "internal_error";
}
