import "server-only";

export type StoreMcpToolErrorCode =
  | "authentication_required"
  | "internal_error"
  | "missing_scope"
  | "not_found"
  | "store_channel_missing"
  | "validation_error";

export class StoreMcpToolError extends Error {
  readonly code: StoreMcpToolErrorCode;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(
    code: StoreMcpToolErrorCode,
    message: string,
    options: {
      details?: Record<string, unknown>;
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = "StoreMcpToolError";
    this.code = code;
    this.details = options.details;
    this.status =
      options.status ??
      (code === "authentication_required"
        ? 401
        : code === "missing_scope"
          ? 403
          : code === "not_found"
            ? 404
            : 400);
  }
}
