export interface AgentApiError {
  message: string;
  statusCode: number;
}

export function isAgentApiError(error: unknown): error is AgentApiError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { message?: unknown; statusCode?: unknown };

  return (
    typeof candidate.message === "string" &&
    typeof candidate.statusCode === "number" &&
    Number.isInteger(candidate.statusCode) &&
    candidate.statusCode >= 400 &&
    candidate.statusCode < 600
  );
}
