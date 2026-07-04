import "server-only";

import { AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS } from "@/lib/ai/agent-harness";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { MODELS } from "@konfi/firebase";
import type { ApiResponseSchema } from "@konfi/types";
import { z } from "zod";

type SchemaDefinition = Omit<ApiResponseSchema, "generatedAt">;

export type ExternalProviderSchemaDrafts = {
  allProductsSchema?: SchemaDefinition;
  productSchema?: SchemaDefinition;
  attributeAvailabilitySchema?: SchemaDefinition;
};

export async function generateSchemaFromResponseStep({
  response,
  options,
}: {
  response: unknown;
  options: {
    type: "allProducts" | "product" | "attributeAvailability" | "custom";
    description?: string;
    name?: string;
  };
}): Promise<SchemaDefinition | null> {
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

  const schemaTool = tool({
    description:
      "Generate a TypeScript-style schema definition from API response",
    inputSchema: z.object({
      description: z
        .string()
        .describe("Description of what this API endpoint returns"),
      rootType: z
        .enum(["object", "array", "string", "number", "boolean"])
        .describe("Type of the root response"),
      properties: z
        .record(
          z.string(),
          z.object({
            type: z.enum([
              "object",
              "array",
              "string",
              "number",
              "boolean",
              "null",
            ]),
            description: z.string().optional(),
            required: z.boolean().optional(),
            properties: z.record(z.string(), z.any()).optional(),
            items: z.any().optional(),
            example: z.any().optional(),
          }),
        )
        .optional()
        .describe("Properties if root type is object"),
      items: z
        .object({
          type: z.enum([
            "object",
            "array",
            "string",
            "number",
            "boolean",
            "null",
          ]),
          description: z.string().optional(),
          properties: z.record(z.string(), z.any()).optional(),
          example: z.any().optional(),
        })
        .optional()
        .describe("Schema of array items if root type is array"),
      example: z.any().optional().describe("Example response value"),
    }),
    execute: async (schema) => schema,
  });

  const endpointDescriptions: Record<
    "allProducts" | "product" | "attributeAvailability" | "custom",
    string
  > = {
    allProducts: "This endpoint returns a list of all available products",
    product:
      "This endpoint returns detailed information about a specific product including attributes and configuration options",
    attributeAvailability:
      "This endpoint returns which attributes are available/disabled for a specific product configuration",
    custom: "This endpoint returns provider-specific data for imports",
  };

  const endpointType = options.type;
  const endpointName = options.name ? ` (${options.name})` : "";
  const endpointDescription =
    options.description?.trim() || endpointDescriptions[endpointType];

  const prompt = `Analyze the following API response and generate a detailed schema specification.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

Endpoint type: ${endpointType}${endpointName}
Purpose: ${endpointDescription}

API Response:
${JSON.stringify(response, null, 2).substring(0, 10000)}

Generate a comprehensive schema that describes:
1. The root type (object, array, etc.)
2. All properties and their types
3. Nested structures
4. Which fields are typically required
5. Examples for each property
6. Clear descriptions for each field

Focus on identifying:
- Product identifiers (id, sku, name)
- Attribute information (name, values, options)
- Price/pricing related fields
- Image URLs
- Configuration options
- Availability flags

Call the schema tool with the complete schema definition.`;

  try {
    const { toolCalls } = await meteredGenerateText({
      model,
      prompt,
      toolChoice: { type: "tool", toolName: "generateSchema" },
      tools: { generateSchema: schemaTool },
      temperature: 0.2,
    });

    if (toolCalls.length === 0) {
      return null;
    }

    const toolCall = toolCalls.find(
      (call) => !call.dynamic && call.toolName === "generateSchema",
    );

    if (!toolCall || toolCall.dynamic) {
      return null;
    }

    return toolCall.input as SchemaDefinition;
  } catch (error) {
    console.error("Error generating schema:", error);
    return null;
  }
}
