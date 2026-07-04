"use server";

import "server-only";

import { checkAdmin } from "@/actions";
import { getAuthenticatedAdminUid } from "@/actions/auth-utils";
import {
  AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS,
  AGENT_HARNESS_SHARED_INSTRUCTIONS,
} from "@/lib/ai/agent-harness";
import { createSearchAgent } from "@/lib/ai/agents";
import { runMeteredAdminAiText } from "@/lib/ai/metered-text";
import { getVertexClient } from "@/lib/ai/server-vertex";
import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import { generateText, Output } from "ai";
import { z } from "zod";

const MAX_GPSR_SAFETY_INFORMATION_LENGTH = 5000;

const allegroGpsrSafetyInformationSchema = z.object({
  safetyInformationDescription: z
    .string()
    .min(1)
    .max(MAX_GPSR_SAFETY_INFORMATION_LENGTH),
  sourceSummary: z.string().max(1000).optional(),
});

export interface GenerateAllegroGpsrSafetyInformationInput {
  category: {
    id: string;
    name?: string;
    path?: string[];
  };
  configurationDescription: string;
  locale: string;
  manualParameters: Array<{
    name: string;
    value: string;
  }>;
  offerTitle: string;
  parameters: Array<{
    name: string;
    value: string;
  }>;
  product: {
    categoryName?: string;
    description: string;
    keywords: string[];
    name: string;
    productTypeName?: string;
  };
  quantity: number;
}

export interface GenerateAllegroGpsrSafetyInformationResult {
  safetyInformationDescription: string;
  sourceSummary?: string;
}

function trimText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeLocale(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.startsWith("pl") ? "pl" : "en";
}

function buildOfferContext(
  input: GenerateAllegroGpsrSafetyInformationInput,
): string {
  return JSON.stringify(
    {
      allegroCategory: {
        id: input.category.id,
        name: input.category.name,
        path: input.category.path,
      },
      configurationDescription: input.configurationDescription,
      manualParameters: input.manualParameters,
      offerTitle: input.offerTitle,
      parameters: input.parameters,
      product: input.product,
      quantity: input.quantity,
    },
    null,
    2,
  );
}

export async function generateAllegroGpsrSafetyInformation(
  input: GenerateAllegroGpsrSafetyInformationInput,
): Promise<GenerateAllegroGpsrSafetyInformationResult> {
  await checkAdmin();
  const [tenantContext, adminUid] = await Promise.all([
    getTenantContextForRequest(),
    getAuthenticatedAdminUid(),
  ]);

  const locale = normalizeLocale(input.locale);
  const offerContext = buildOfferContext(input);
  const researchAgent = await createSearchAgent();
  const researchResult = await researchAgent.generate({
    options: {
      locale,
      taskContext:
        "Research GPSR product safety considerations for an Allegro offer. Focus on factual product-category safety information, not legal advice.",
    },
    prompt: [
      "Research safety considerations and common responsible-use guidance for this offer category and product context.",
      "Use web search where useful. Return concise evidence and note uncertainty.",
      "",
      offerContext,
    ].join("\n"),
  });
  const vertex = await getVertexClient();
  const system = [
    AGENT_HARNESS_SHARED_INSTRUCTIONS,
    AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS,
    "You draft editable GPSR safety information for Allegro product offers.",
    "Use the offer context and web research. Do not invent certifications, compliance claims, producer identities, test results, or hazards not supported by the product category.",
    "If the product is a printed paper product with no special hazards, provide concise general handling, storage, fire, moisture, packaging, and disposal guidance.",
    "Return only the structured output. Write the safety text in Polish when locale is pl, otherwise English.",
  ].join("\n\n");
  const prompt = [
    `Locale: ${locale}`,
    "",
    "Offer context:",
    offerContext,
    "",
    "Web research summary:",
    researchResult.text,
    "",
    "Generate one ready-to-edit safetyInformationDescription suitable for Allegro's productSet[0].safetyInformation TEXT field.",
    "Keep it factual, practical, and under 5000 characters. Include no markdown headings.",
  ].join("\n");
  const { output } = await runMeteredAdminAiText({
    context: tenantContext,
    input: { prompt, system },
    model: MODELS.GEMINI_3_FLASH,
    provider: "google-vertex",
    run: () =>
      generateText({
        model: vertex(MODELS.GEMINI_3_FLASH),
        output: Output.object({ schema: allegroGpsrSafetyInformationSchema }),
        system,
        prompt,
      }),
    source: "admin-action",
    userId: adminUid,
  });

  return {
    safetyInformationDescription: trimText(
      output.safetyInformationDescription,
      MAX_GPSR_SAFETY_INFORMATION_LENGTH,
    ),
    sourceSummary: output.sourceSummary
      ? trimText(output.sourceSummary, 1000)
      : undefined,
  };
}
