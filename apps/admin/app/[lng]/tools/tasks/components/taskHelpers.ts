import { AgentMessage, AgentStatus } from "@/context/agents";
import type {
  AgentInteractionField,
  AgentInteractionFieldOption,
  AgentInteractionKind,
  AgentInteractionSpec,
} from "@/lib/ai/agent-harness";
import {
  getLatestPendingAgentHook,
  type AgentPendingHook,
} from "@/lib/ai/durable-agents/pending-hooks";

export type PendingHook = AgentPendingHook;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAgentInteractionKind(value: unknown): value is AgentInteractionKind {
  return (
    value === "question" ||
    value === "approval" ||
    value === "form" ||
    value === "status"
  );
}

function isAgentInteractionFieldOption(
  value: unknown,
): value is AgentInteractionFieldOption {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    (value.description === undefined || typeof value.description === "string")
  );
}

function isAgentInteractionField(
  value: unknown,
): value is AgentInteractionField {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    (value.kind === "text" ||
      value.kind === "textarea" ||
      value.kind === "boolean" ||
      value.kind === "json" ||
      value.kind === "select") &&
    (value.options === undefined ||
      (Array.isArray(value.options) &&
        value.options.every(isAgentInteractionFieldOption)))
  );
}

function normalizeInteractionFields(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter(isAgentInteractionField);
}

function isAgentInteractionSpec(value: unknown): value is AgentInteractionSpec {
  return (
    isRecord(value) &&
    value.version === "konfi.agent-interaction.v1" &&
    typeof value.title === "string" &&
    isAgentInteractionKind(value.kind)
  );
}

function getCommonPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }
  return maxLength;
}

function isOverlappingParagraph(left: string, right: string): boolean {
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }

  const shorterLength = Math.min(left.length, right.length);
  if (shorterLength < 40) {
    return false;
  }

  return getCommonPrefixLength(left, right) / shorterLength >= 0.8;
}

function normalizeInteractionBody(...parts: unknown[]): string {
  const paragraphs = parts
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) => value.split(/\n{2,}/))
    .map((value) => value.trim())
    .filter(Boolean);

  const uniqueParagraphs: string[] = [];
  for (const paragraph of paragraphs) {
    const normalizedParagraph = paragraph.replace(/\s+/g, " ");
    const coveredParagraphIndex = uniqueParagraphs.findIndex(
      (existingParagraph) => {
        const normalizedExistingParagraph = existingParagraph.replace(
          /\s+/g,
          " ",
        );
        return isOverlappingParagraph(
          normalizedExistingParagraph,
          normalizedParagraph,
        );
      },
    );

    if (coveredParagraphIndex === -1) {
      uniqueParagraphs.push(paragraph);
      continue;
    }

    const existingParagraph = uniqueParagraphs[coveredParagraphIndex];
    const normalizedExistingParagraph = existingParagraph.replace(/\s+/g, " ");
    if (normalizedParagraph.length > normalizedExistingParagraph.length) {
      uniqueParagraphs[coveredParagraphIndex] = paragraph;
    }
  }

  return uniqueParagraphs.join("\n\n");
}

export function getPendingInteraction(
  pendingHook?: PendingHook | null,
): AgentInteractionSpec | null {
  const storedInteraction = pendingHook?.args?.interaction;
  if (isAgentInteractionSpec(storedInteraction)) {
    return {
      ...storedInteraction,
      body: normalizeInteractionBody(storedInteraction.body),
      fields: normalizeInteractionFields(storedInteraction.fields),
    };
  }

  const body = normalizeInteractionBody(
    pendingHook?.args?.question,
    pendingHook?.args?.context,
  );

  if (!body) {
    return null;
  }

  return {
    body,
    kind: "question",
    title: "",
    version: "konfi.agent-interaction.v1",
  };
}

/**
 * Infer the most recent human-in-the-loop request from the message log.
 * We don't rely on Firestore-only fields here because the list API currently
 * only exposes messages/status.
 */
export function getLatestPendingHook(
  messages?: AgentMessage[],
): PendingHook | null {
  return getLatestPendingAgentHook(messages);
}

export function isCatalogSetupPendingHook(
  pendingHook?: PendingHook | null,
): boolean {
  const interaction = getPendingInteraction(pendingHook);
  return (
    interaction?.metadata?.["reason"] === "catalogSetup" ||
    interaction?.fields?.some(
      (field) => field.id === "catalogSetupPlan" && field.kind === "json",
    ) === true
  );
}

export const statusColorMap: Record<AgentStatus, string> = {
  pending: "gray",
  processing: "primary",
  "awaiting-approval": "orange",
  approved: "success",
  rejected: "red",
  completed: "success",
  failed: "red",
};

export const statusIconMap: Record<AgentStatus, string> = {
  pending: "schedule",
  processing: "sync",
  "awaiting-approval": "approval",
  approved: "check_circle",
  rejected: "cancel",
  completed: "task_alt",
  failed: "error",
};

export function formatRelativeTime(date: Date, locale: string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSec < 60) {
    return rtf.format(-diffSec, "second");
  }
  if (diffMin < 60) {
    return rtf.format(-diffMin, "minute");
  }
  if (diffHour < 24) {
    return rtf.format(-diffHour, "hour");
  }
  return rtf.format(-diffDay, "day");
}

export function formatTimeLeft(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}min`;
}

export function extractToolCalls(messages: AgentMessage[]): Array<{
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  role: "tool";
}> {
  const toolCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: unknown;
    role: "tool";
  }> = [];

  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool-call" && part.toolName) {
          toolCalls.push({
            toolName: part.toolName,
            args: (part.args as Record<string, unknown>) ?? {},
            result: part.result,
            role: "tool",
          });
        }
        if (part.type === "tool-result" && part.toolName) {
          const existing = toolCalls.find(
            (tc) => tc.toolName === part.toolName && !tc.result,
          );
          if (existing) {
            existing.result = part.result;
          } else {
            toolCalls.push({
              toolName: part.toolName,
              args: {},
              result: part.result,
              role: "tool",
            });
          }
        }
      }
    }
  }

  return toolCalls;
}

function isHumanInteractionToolName(toolName?: string): boolean {
  return (
    toolName === "requestQuoteApproval" ||
    toolName === "requestUserConfirmation"
  );
}

function getAssistantText(message: AgentMessage): string | null {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return null;
  }

  const textParts = message.content.filter((part) => {
    return part.type === "text" && part.text;
  });

  if (textParts.length === 0) {
    return null;
  }

  return textParts.map((part) => part.text).join("\n");
}

export function getLastAssistantMessage(
  messages: AgentMessage[],
): string | null {
  const completedToolCallIds = new Set<string>();
  let hasLaterUserResponse = false;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];

    if (msg.role === "user") {
      hasLaterUserResponse = true;
      continue;
    }

    if (msg.role !== "assistant") {
      continue;
    }

    if (Array.isArray(msg.content)) {
      const humanInteractionToolCallIds: string[] = [];

      for (const part of msg.content) {
        if (
          part.type === "tool-result" &&
          typeof part.toolCallId === "string"
        ) {
          completedToolCallIds.add(part.toolCallId);
          continue;
        }

        if (
          part.type === "tool-call" &&
          typeof part.toolCallId === "string" &&
          isHumanInteractionToolName(part.toolName)
        ) {
          humanInteractionToolCallIds.push(part.toolCallId);
        }
      }

      if (
        humanInteractionToolCallIds.length > 0 &&
        (hasLaterUserResponse ||
          humanInteractionToolCallIds.some((toolCallId) =>
            completedToolCallIds.has(toolCallId),
          ))
      ) {
        continue;
      }
    }

    const text = getAssistantText(msg);
    if (!text) {
      continue;
    }

    if (hasLaterUserResponse && text.trim().endsWith("?")) {
      continue;
    }

    return text;
  }
  return null;
}
