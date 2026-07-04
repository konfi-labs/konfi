import "server-only";

import {
  getStoreVertexClient,
  getStoreVertexThinkingProviderOptions,
} from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getStoreRuntimeConfigForRequest,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { loadStoreAiInstructionSettings } from "@/lib/ai/ai-instruction-settings.server";
import {
  estimateAiUsageTextTokens,
  runMeteredAiText,
} from "@/lib/ai/usage-metering";
import {
  createStorefrontAssistantToolMemory,
  createStorefrontAssistantTools,
  type StorefrontAssistantToolMemory,
} from "@/lib/storefront-assistant/tools.server";
import type {
  StorefrontAssistantResponse,
  StorefrontAssistantTopic,
} from "@/lib/storefront-assistant/types";
import { buildStorefrontAssistantInstructions } from "@/lib/storefront-assistant/instructions";
import { MODELS } from "@konfi/firebase";
import { Locale } from "@konfi/types";
import { ToolLoopAgent, isStepCount } from "ai";

function isRefusal(answer: string) {
  const normalized = answer.toLowerCase();

  return [
    "nie mogę",
    "nie moge",
    "nie jestem w stanie",
    "cannot",
    "can't",
    "i do not have access",
  ].some((phrase) => normalized.includes(phrase));
}

function inferTopic({
  answer,
  memory,
}: {
  answer: string;
  memory: StorefrontAssistantToolMemory;
}): StorefrontAssistantTopic {
  if (isRefusal(answer)) {
    return "refusal";
  }

  if (memory.products.length > 0) {
    return "product-suggestion";
  }

  if (
    memory.pageContents.some(
      (pageContent) => pageContent.route === "help/contact",
    )
  ) {
    return "contact";
  }

  if (
    memory.pageContents.some(
      (pageContent) => pageContent.route === "help/reasons-for-rejections",
    )
  ) {
    return "print-prep";
  }

  return "fallback";
}

const fallbackAnswers: Record<Locale, string> = {
  cs: "Teď na to nedokážu spolehlivě odpovědět. Použijte prosím kontaktní stránku a náš tým vám pomůže přímo.",
  de: "Ich kann das gerade nicht zuverlässig beantworten. Bitte nutzen Sie die Kontaktseite, und unser Team hilft Ihnen direkt.",
  en: "I cannot answer that reliably right now. Please use the contact page and our team will help you directly.",
  fr: "Je ne peux pas répondre à cela de manière fiable pour le moment. Veuillez utiliser la page de contact et notre équipe vous aidera directement.",
  pl: "Nie mogę teraz odpowiedzieć na to wiarygodnie. Skorzystaj ze strony kontaktu, a nasz zespół pomoże bezpośrednio.",
  sk: "Momentálne na to neviem spoľahlivo odpovedať. Použite prosím kontaktnú stránku a náš tím vám pomôže priamo.",
  uk: "Зараз я не можу надійно відповісти на це запитання. Скористайтеся сторінкою контактів, і наша команда допоможе вам напряму.",
};

function fallbackAnswer(locale: Locale) {
  return fallbackAnswers[locale];
}

function buildResponseFromAgentText({
  answer,
  locale,
  memory,
}: {
  answer: string;
  locale: Locale;
  memory: StorefrontAssistantToolMemory;
}): StorefrontAssistantResponse {
  const resolvedAnswer = answer.trim() || fallbackAnswer(locale);

  return {
    answer: resolvedAnswer,
    contact: memory.contacts[0],
    products: memory.products.slice(0, 3),
    refusal: isRefusal(resolvedAnswer),
    topic: inferTopic({ answer: resolvedAnswer, memory }),
  };
}

export async function runStorefrontAssistant({
  locale,
  message,
}: {
  locale: Locale;
  message: string;
}): Promise<StorefrontAssistantResponse> {
  const vertex = await getStoreVertexClient();
  const memory = createStorefrontAssistantToolMemory();
  const [tenantContext, runtimeConfig] = await Promise.all([
    getTenantContextForRequest(),
    getStoreRuntimeConfigForRequest(),
  ]);
  const aiInstructionSettings = await loadStoreAiInstructionSettings({
    channelId: runtimeConfig?.channelId,
    tenantContext,
  });
  const instructions = buildStorefrontAssistantInstructions(
    locale,
    aiInstructionSettings,
  );
  const agent = new ToolLoopAgent({
    id: "storefront-assistant",
    instructions,
    model: vertex(MODELS.GEMINI_3_FLASH_LITE),
    providerOptions: getStoreVertexThinkingProviderOptions({
      thinkingLevel: "minimal",
    }),
    prepareStep: async ({ stepNumber }) => {
      if (stepNumber === 0) {
        return {
          activeTools: ["getStorefrontContext"],
          toolChoice: "required",
        };
      }

      return {};
    },
    stopWhen: isStepCount(6),
    temperature: 0.2,
    tools: createStorefrontAssistantTools({ locale, memory }),
  });
  const { text } = await runMeteredAiText({
    estimatedTotalTokens: estimateAiUsageTextTokens({
      message,
      instructions,
    }),
    metering: {
      context: tenantContext,
      firestore: getAdminDb(),
      model: MODELS.GEMINI_3_FLASH_LITE,
      provider: "google-vertex",
      source: "storefront-assistant",
    },
    run: () =>
      agent.generate({
        prompt: message,
      }),
  });

  return buildResponseFromAgentText({
    answer: text,
    locale,
    memory,
  });
}
