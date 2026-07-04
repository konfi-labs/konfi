export type AgentPendingHookType = "userConfirmation" | "quoteApproval";

export type AgentPendingHookToolName =
  | "requestUserConfirmation"
  | "requestQuoteApproval";

export type AgentPendingHook = {
  args?: Record<string, unknown>;
  hookType: AgentPendingHookType;
  toolCallId: string;
  toolName: AgentPendingHookToolName;
};

type AgentMessagePartLike = {
  args?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  type?: unknown;
};

type AgentMessageLike = {
  content?: unknown;
  role?: unknown;
};

function normalizeHookToolName(
  value: unknown,
): AgentPendingHookToolName | null {
  if (
    value === "requestUserConfirmation" ||
    value === "requestQuoteApproval"
  ) {
    return value;
  }

  return null;
}

function hookTypeForToolName(
  toolName: AgentPendingHookToolName,
): AgentPendingHookType {
  return toolName === "requestQuoteApproval"
    ? "quoteApproval"
    : "userConfirmation";
}

function normalizeArgs(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function getLatestPendingAgentHook(
  messages: unknown,
): AgentPendingHook | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  const completedToolCallIds = new Set<string>();
  let hasLaterUserResponse = false;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as AgentMessageLike;
    if (message?.role === "user") {
      hasLaterUserResponse = true;
      continue;
    }

    if (!Array.isArray(message?.content)) {
      continue;
    }

    const content = message.content as AgentMessagePartLike[];
    for (let j = content.length - 1; j >= 0; j -= 1) {
      const part = content[j];
      if (part?.type === "tool-result" && typeof part.toolCallId === "string") {
        completedToolCallIds.add(part.toolCallId);
        continue;
      }

      if (part?.type !== "tool-call" || typeof part.toolCallId !== "string") {
        continue;
      }

      if (hasLaterUserResponse || completedToolCallIds.has(part.toolCallId)) {
        continue;
      }

      const toolName = normalizeHookToolName(part.toolName);
      if (!toolName) {
        continue;
      }

      return {
        args: normalizeArgs(part.args),
        hookType: hookTypeForToolName(toolName),
        toolCallId: part.toolCallId,
        toolName,
      };
    }
  }

  return null;
}
