import "server-only";

import { ModelMessage } from "ai";

// Configuration for context window management
const MAX_MESSAGES_BEFORE_SUMMARIZATION = 20;
const MESSAGES_TO_KEEP_RECENT = 6; // Keep last 6 messages (3 turns) intact
const MAX_SUMMARY_TOKENS_ESTIMATE = 500; // Rough estimate for summary length

interface SummarizedContext {
  messages: ModelMessage[];
  wasSummarized: boolean;
  summaryText?: string;
}

/**
 * Estimate token count for a message (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract text content from a message for summarization
 */
function getMessageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("\n");
  }

  return "";
}

/**
 * Create a condensed summary of older messages
 * This creates a system-injected summary to preserve context without full history
 */
function createConversationSummary(messages: ModelMessage[]): string {
  const summaryParts: string[] = [];

  for (const message of messages) {
    const text = getMessageText(message);
    if (!text.trim()) continue;

    const role = message.role === "user" ? "User" : "Assistant";
    // Truncate long messages in summary
    const truncatedText =
      text.length > 200 ? text.substring(0, 200) + "..." : text;

    summaryParts.push(`${role}: ${truncatedText}`);
  }

  return summaryParts.join("\n");
}

/**
 * Summarize conversation context when it gets too long
 * Keeps recent messages intact and creates a summary of older ones
 */
export function summarizeContext(messages: ModelMessage[]): SummarizedContext {
  // Don't summarize if conversation is short enough
  if (messages.length <= MAX_MESSAGES_BEFORE_SUMMARIZATION) {
    return {
      messages,
      wasSummarized: false,
    };
  }

  // Split into older messages (to summarize) and recent messages (to keep)
  const cutoffIndex = messages.length - MESSAGES_TO_KEEP_RECENT;
  const olderMessages = messages.slice(0, cutoffIndex);
  const recentMessages = messages.slice(cutoffIndex);

  // Create summary of older messages
  const summaryText = createConversationSummary(olderMessages);

  // Create a system message with the summary
  const summaryMessage: ModelMessage = {
    role: "system",
    content: `[Previous conversation summary - ${olderMessages.length} messages]\n${summaryText}\n[End of summary - Continue from here]`,
  };

  return {
    messages: [summaryMessage, ...recentMessages],
    wasSummarized: true,
    summaryText,
  };
}

/**
 * Check if context should be summarized based on message count
 */
export function shouldSummarize(messageCount: number): boolean {
  return messageCount > MAX_MESSAGES_BEFORE_SUMMARIZATION;
}

/**
 * Get context stats for debugging/display
 */
export function getContextStats(messages: ModelMessage[]): {
  messageCount: number;
  estimatedTokens: number;
  shouldSummarize: boolean;
} {
  let totalTokens = 0;

  for (const message of messages) {
    const text = getMessageText(message);
    totalTokens += estimateTokens(text);
  }

  return {
    messageCount: messages.length,
    estimatedTokens: totalTokens,
    shouldSummarize: messages.length > MAX_MESSAGES_BEFORE_SUMMARIZATION,
  };
}
