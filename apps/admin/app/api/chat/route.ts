import {
  createSpecializedAgentTools,
  getDefaultSystemPrompt,
} from "@/lib/ai/agents";
import { buildAdminAssistantSystemPrompt } from "@/lib/ai/admin-assistant-prompt";
import { loadAdminAiInstructionSettings } from "@/lib/ai/ai-instruction-settings.server";
import {
  AdminAuthError,
  getAuthenticatedAdminUid,
  requireTenantAdminChannelAccess,
} from "@/actions/auth-utils";
import { sanitizeUIMessages } from "@/lib/ai/chat-message-sanitization";
import { summarizeContext } from "@/lib/ai/context-summarization";
import { getVertexModel, streamAdminText } from "@/lib/ai/server-vertex";
import { createAssistantTools, ToolContext } from "@/lib/ai/tools";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  getAssistantModelConfig,
  MODELS,
  resolveAssistantModelId,
} from "@konfi/firebase";
import { Attribute, Channel, NestedMember } from "@konfi/types";
import { all } from "better-all";
import {
  createUIMessageStreamResponse,
  convertToModelMessages,
  isStepCount,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import { TFunction } from "i18next";
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "../../actions";

export const maxDuration = 60;

// File upload validation constants
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per file
const MAX_TOTAL_FILES_SIZE_BYTES = 20 * 1024 * 1024; // 20MB total
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

interface FileValidationError {
  message: string;
  details?: string;
}

/**
 * Validate file parts in messages for size and type restrictions
 */
function validateFileParts(messages: UIMessage[]): FileValidationError | null {
  let totalFilesSize = 0;

  for (const message of messages) {
    if (!message.parts || !Array.isArray(message.parts)) continue;

    for (const part of message.parts) {
      if (part.type !== "file") continue;

      const filePart = part as {
        type: "file";
        mediaType: string;
        url: string;
        filename?: string;
      };

      // Validate media type
      if (
        !filePart.mediaType ||
        !ALLOWED_FILE_TYPES.includes(filePart.mediaType)
      ) {
        return {
          message: "Unsupported file type",
          details: `File type "${filePart.mediaType || "unknown"}" is not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(", ")}`,
        };
      }

      // Validate file size (for data URLs)
      if (filePart.url && filePart.url.startsWith("data:")) {
        // Extract base64 data and calculate approximate size
        const base64Match = filePart.url.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          // Base64 encoding increases size by ~33%, so actual bytes ≈ base64Length * 0.75
          const base64Data = base64Match[1];
          const estimatedBytes = Math.ceil(base64Data.length * 0.75);

          if (estimatedBytes > MAX_FILE_SIZE_BYTES) {
            return {
              message: "File too large",
              details: `File "${filePart.filename || "unnamed"}" exceeds the maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
            };
          }

          totalFilesSize += estimatedBytes;
        }
      }
    }
  }

  // Check total files size
  if (totalFilesSize > MAX_TOTAL_FILES_SIZE_BYTES) {
    return {
      message: "Total files size too large",
      details: `Total uploaded files exceed the maximum of ${MAX_TOTAL_FILES_SIZE_BYTES / (1024 * 1024)}MB`,
    };
  }

  return null;
}

interface ChatRequestBody {
  messages: UIMessage[];
  modelId?: string;
  channelId: string;
  channel?: Channel;
  attributes?: Attribute[];
  systemPrompt?: string;
  locale?: string;
  createdBy?: NestedMember;
}

function ensureVisibleAssistantText(
  stream: ReadableStream<UIMessageChunk>,
  fallbackText: string,
): ReadableStream<UIMessageChunk> {
  // Start true: we need visible text before the stream ends.
  // Reset to true whenever a tool result arrives (model must respond with text
  // after each tool round). Set to false when visible text is observed.
  let needsFallback = true;
  let fallbackWritten = false;
  const fallbackTextId = `chat-fallback-${Date.now()}`;

  const writeFallback = (
    controller: TransformStreamDefaultController<UIMessageChunk>,
  ) => {
    if (!needsFallback || fallbackWritten) return;
    fallbackWritten = true;
    controller.enqueue({ type: "text-start", id: fallbackTextId });
    controller.enqueue({
      type: "text-delta",
      id: fallbackTextId,
      delta: fallbackText,
    });
    controller.enqueue({ type: "text-end", id: fallbackTextId });
  };

  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        // Visible text produced → no longer need a fallback (for now).
        if (chunk.type === "text-delta" && chunk.delta.trim().length > 0) {
          needsFallback = false;
        }

        // Tool result delivered back to the model → the model must now respond
        // with text; reset so we require visible text again after this round.
        if (
          chunk.type === "tool-output-available" ||
          chunk.type === "tool-output-error"
        ) {
          needsFallback = true;
        }

        if (chunk.type === "finish") {
          writeFallback(controller);
        }

        controller.enqueue(chunk);
      },
      flush(controller) {
        writeFallback(controller);
      },
    }),
  );
}

export async function POST(request: NextRequest) {
  try {
    await checkAdmin();

    // Parse request body
    const body: ChatRequestBody = await request.json();
    const {
      messages,
      modelId = MODELS.ASSISTANT_FAST,
      channelId,
      attributes,
      systemPrompt,
      locale = "en",
      createdBy,
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Bad Request: Messages array required" },
        { status: 400 },
      );
    }

    if (!channelId) {
      return NextResponse.json(
        { error: "Bad Request: channelId required" },
        { status: 400 },
      );
    }

    // Validate file uploads (size and type)
    const fileValidationError = validateFileParts(messages);
    if (fileValidationError) {
      return NextResponse.json(
        {
          error: fileValidationError.message,
          details: fileValidationError.details,
        },
        { status: 400 },
      );
    }

    const sanitizedMessages = sanitizeUIMessages(messages);
    const authorizedChannelId =
      await requireTenantAdminChannelAccess(channelId);
    const [tenantContext, userId] = await Promise.all([
      getTenantContextForRequest(),
      getAuthenticatedAdminUid(),
    ]);

    // Build model config and convert messages with dependency-aware parallelism
    const { assistantModelConfig, providerModelId, model, modelMessages } =
      await all({
        assistantModelId() {
          return resolveAssistantModelId(modelId);
        },
        async assistantModelConfig() {
          return getAssistantModelConfig(await this.$.assistantModelId);
        },
        async providerModelId() {
          const config = await this.$.assistantModelConfig;
          return config.providerModelId ?? MODELS.GEMINI_FLASH_LATEST;
        },
        async model() {
          return getVertexModel(await this.$.providerModelId);
        },
        async modelMessages() {
          return convertToModelMessages(sanitizedMessages);
        },
      });

    // Apply context summarization for long conversations
    const { messages: summarizedMessages, wasSummarized } =
      summarizeContext(modelMessages);

    if (wasSummarized && process.env.NODE_ENV === "development") {
      console.log(
        `[Chat API] Context summarized: ${modelMessages.length} -> ${summarizedMessages.length} messages`,
      );
    }

    // Create a simple t function for server-side use that supports {{variable}} interpolation
    const t: TFunction = ((key: string, options?: Record<string, unknown>) => {
      const template =
        (options?.defaultValue as string | undefined) ?? (key as string);
      if (!options) return template;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
        const val = options[name];
        return val !== undefined && val !== null ? String(val) : `{{${name}}}`;
      });
    }) as TFunction;

    // Get Firestore instance for tools
    const firestore = getAdminDb();

    // Create tool context
    const toolContext: ToolContext = {
      channelId: authorizedChannelId,
      firestore: firestore as unknown as FirebaseFirestore.Firestore,
      tenantContext,
      t,
      attributes: attributes || [],
      createdBy,
      onLog: (message) => {
        // Logs can be included in metadata if needed
        if (process.env.NODE_ENV === "development") {
          console.log("[Chat API Tool Log]:", message);
        }
      },
    };

    // Create business data tools (orders, customers, invoices, products)
    const dataTools = createAssistantTools(toolContext);

    // Create specialized agent tools (web search, code execution, maps)
    // These tools invoke separate agents with native Vertex capabilities
    const specializedTools = createSpecializedAgentTools(locale);

    // Combine all tools - data tools + specialized agent tools
    const allTools = {
      ...dataTools,
      ...specializedTools,
    };

    // Get the default system prompt that explains all capabilities
    const defaultSystemPrompt = getDefaultSystemPrompt(locale);
    const finalAnswerGuardrail =
      "CRITICAL RULE: After every tool round, you MUST write a text response to the user. Never end a turn with only tool calls. If a tool returns an error or a hint saying do not retry, stop calling tools immediately and explain what happened to the user in plain text. Do not call the same tool twice with the same inputs. Do not call unrelated tools after an error.";
    const aiInstructionSettings = await loadAdminAiInstructionSettings({
      channelId: authorizedChannelId,
      tenantContext,
    });

    const finalSystemPrompt = buildAdminAssistantSystemPrompt({
      clientSystemPrompt: systemPrompt,
      defaultSystemPrompt,
      finalAnswerGuardrail,
      settings: aiInstructionSettings,
    });

    // Use streamAdminText for authenticated streaming
    const result = await streamAdminText({
      model,
      instructions: finalSystemPrompt,
      messages: summarizedMessages,
      tools: allTools,
      toolLoopTemperature: 0,
      stopWhen: isStepCount(8), // Cap tool loop at 8 model invocations to prevent infinite loops
      maxRetries: 2, // Retry up to 2 times on failure
      maxOutputTokens: assistantModelConfig.maxTokens,
      metering: {
        channelId: authorizedChannelId,
        context: tenantContext,
        firestore: getAdminDb(),
        model: providerModelId,
        provider: "google-vertex",
        source: "admin-chat",
        userId,
      },
      // Enable experimental features if supported
      ...(assistantModelConfig.supportsThoughts
        ? {
            experimental_thinking: {
              enabled: true,
              modelId: providerModelId,
            },
          }
        : {}),
    });

    const fallbackText = t("assistant.noFinalAnswerFallback", {
      defaultValue:
        "I gathered some information, but I could not produce a final answer before the tool loop ended. Please try a narrower question or ask me to continue from the results above.",
    });

    const uiStream = result.toUIMessageStream<UIMessage>({
      sendReasoning: true,
      onError: (error) => {
        console.error("[Chat API Stream Error]:", error);
        return "The assistant stream hit an error. Please try again with a narrower question.";
      },
    });

    // If the model stops after tool calls without visible text, inject a
    // deterministic fallback so the assistant message never appears stuck.
    return createUIMessageStreamResponse({
      stream: ensureVisibleAssistantText(uiStream, fallbackText),
    });
  } catch (error) {
    console.error("[Chat API Error]:", error);

    if (
      error instanceof Error &&
      (error.name === "AI_InvalidPromptError" ||
        error.message.includes(
          "Invalid prompt: The messages do not match the ModelMessage[] schema",
        ))
    ) {
      return NextResponse.json(
        {
          error:
            "This chat history contains unsupported message data. Please try again or start a new chat.",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error) {
      if (error instanceof AdminAuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode },
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
