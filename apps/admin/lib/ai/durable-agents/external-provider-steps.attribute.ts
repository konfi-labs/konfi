import "server-only";

import { AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS } from "@/lib/ai/agent-harness";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { MODELS } from "@konfi/firebase";
import { z } from "zod";

export type AttributeDetectionResult = {
  hasAttributes: boolean;
  confidence: number;
  attributeCount?: number;
  rationale: string;
};

export async function detectAttributePayloadStep({
  response,
  options,
}: {
  response: unknown;
  options?: {
    endpointName?: string;
    endpointUrl?: string;
  };
}): Promise<AttributeDetectionResult> {
  "use step";

  const { generateText, tool } = await import("ai");
  const meteredGenerateText = createMeteredAdminGenerateText({
    generateText,
    model: MODELS.GEMINI_3_FLASH,
    provider: "google-vertex",
    source: "external-import",
  });
  const { getAdminVertexLanguageModel } = await import(
    "@/lib/ai/vertex-language-model.server"
  );
  const model = await getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH);

  const detectionTool = tool({
    description:
      "Determine if an API response contains product attribute definitions/options",
    inputSchema: z.object({
      hasAttributes: z
        .boolean()
        .describe("True only if attributes/options are clearly present"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence score for the decision"),
      attributeCount: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Approximate number of attribute definitions found"),
      rationale: z.string().describe("Short reasoning for the decision"),
    }),
    execute: async (data) => data,
  });

  const endpointLabel = options?.endpointName
    ? ` (${options.endpointName})`
    : "";
  const endpointUrl = options?.endpointUrl
    ? `\nEndpoint: ${options.endpointUrl}`
    : "";

  const prompt = `You are analyzing an API response to detect whether it contains product attribute definitions/options.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

Return hasAttributes = true ONLY if the response clearly defines configurable attributes with options/values (e.g. attributeSpecs.attributes, attributes array with options, variants/options lists). Do NOT return true for plain product data unless configurable attributes are present.

Endpoint${endpointLabel}.${endpointUrl}

API Response (truncated):
${JSON.stringify(response, null, 2).substring(0, 12000)}

Call the detection tool with your decision.`;

  try {
    const { toolCalls } = await meteredGenerateText({
      model,
      prompt,
      toolChoice: { type: "tool", toolName: "detectAttributes" },
      tools: { detectAttributes: detectionTool },
      temperature: 0.1,
    });

    if (toolCalls.length === 0) {
      return {
        hasAttributes: false,
        confidence: 0,
        rationale: "No tool call from model",
      };
    }

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "detectAttributes",
    );

    if (!toolCall || toolCall.dynamic) {
      return {
        hasAttributes: false,
        confidence: 0,
        rationale: "No detection tool call",
      };
    }

    return toolCall.input as AttributeDetectionResult;
  } catch (error) {
    console.error("Error detecting attribute payload:", error);
    return {
      hasAttributes: false,
      confidence: 0,
      rationale: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
