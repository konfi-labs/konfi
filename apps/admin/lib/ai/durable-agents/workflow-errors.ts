import "server-only";

import { FatalError } from "workflow";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringProperty(
  value: Record<string, unknown>,
  property: string,
): string | undefined {
  const propertyValue = value[property];
  return typeof propertyValue === "string" && propertyValue.trim()
    ? propertyValue
    : undefined;
}

function getStatusProperty(value: Record<string, unknown>): string | undefined {
  const status =
    value.statusCode ?? value.status ?? value.code ?? value.responseStatus;

  if (typeof status === "number") {
    return String(status);
  }

  if (typeof status === "string" && status.trim()) {
    return status;
  }

  return undefined;
}

export function getAgentWorkflowErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (!isRecord(error)) {
    return fallback;
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : getStringProperty(error, "message");
  const name =
    error instanceof Error && error.name.trim()
      ? error.name
      : getStringProperty(error, "name");
  const status = getStatusProperty(error);
  const messagePrefix =
    name && message && !message.startsWith(name) ? `${name}: ` : "";
  const baseMessage = message ? `${messagePrefix}${message}` : fallback;

  return status && !baseMessage.includes(status)
    ? `${baseMessage} (status ${status})`
    : baseMessage;
}

export function createFatalAgentWorkflowError(
  error: unknown,
  fallback: string,
): FatalError {
  return new FatalError(getAgentWorkflowErrorMessage(error, fallback));
}
