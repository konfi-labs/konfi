import "server-only";

import { requireAdminAuth } from "@/actions/auth-utils";
import { wrapModelWithDevTools } from "@/lib/ai/devtools";
import { resolveVertexModelId } from "@/lib/ai/vertex-model-ids";
import {
  estimateAiUsageTextTokens,
  finalizeAiUsage,
  releaseAiUsageReservation,
  reserveAiUsage,
} from "@/lib/ai/usage-metering";
import type { ModelMessage, ToolSet } from "ai";
import type { Firestore } from "firebase-admin/firestore";
import type {
  AiUsageEventSource,
  TenantContext,
} from "@sblyvwx/cloud-contracts";

type AiStreamText = (typeof import("ai"))["streamText"];
type AiWrapLanguageModel = (typeof import("ai"))["wrapLanguageModel"];
type AiGenerateVideo = (typeof import("ai"))["experimental_generateVideo"];
type WrappedLanguageModel = ReturnType<AiWrapLanguageModel>;
type VertexClient = ((model: string) => WrappedLanguageModel) & {
  video(model: string): Parameters<AiGenerateVideo>[0]["model"];
};
type CreateVertex = (options: {
  googleAuthOptions: {
    credentials: {
      client_email: string;
      private_key: string;
    };
  };
  location: string;
  project: string;
}) => VertexClient;
type InstrumentedVertexClient = VertexClient;
type VertexThinkingConfig = {
  includeThoughts?: boolean;
  thinkingBudget?: number;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
};
type VertexLanguageModelOptions = {
  thinkingConfig?: VertexThinkingConfig;
};
type VertexThinkingProviderOptions = {
  modelId?: string;
};

export interface VertexConfig {
  project: string;
  location: string;
  clientEmail: string;
  privateKey: string;
}

interface VertexDevToolsIdentity {
  modelId?: string;
  provider?: string;
}

const VERTEX_DEVTOOLS_PROVIDER = "google-vertex";
export function getVertexConfig(): VertexConfig {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const location = "global";
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;

  if (!project) {
    throw new Error(
      "Missing ADMIN_FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID for Vertex AI.",
    );
  }

  if (!clientEmail) {
    throw new Error("Missing ADMIN_FIREBASE_CLIENT_EMAIL for Vertex AI.");
  }

  if (!privateKeyRaw) {
    throw new Error("Missing ADMIN_FIREBASE_SERVICE_ACCOUNT for Vertex AI.");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  return { project, location, clientEmail, privateKey };
}

let cachedVertexClient: VertexClient | null = null;
const GOOGLE_VERTEX_PACKAGE = "@ai-sdk/" + "google-vertex";
let cachedVertexClientPromise: Promise<VertexClient> | null = null;
let cachedInstrumentedVertexClient: InstrumentedVertexClient | null = null;

async function getOrCreateVertexClient(): Promise<VertexClient> {
  if (cachedVertexClient) {
    return cachedVertexClient;
  }

  cachedVertexClientPromise ??= (async () => {
    const { createVertex } = (await import(
      GOOGLE_VERTEX_PACKAGE
    )) as unknown as {
      createVertex: CreateVertex;
    };
    const { project, location, clientEmail, privateKey } = getVertexConfig();

    return createVertex({
      project,
      location,
      googleAuthOptions: {
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      },
    });
  })();

  cachedVertexClient = await cachedVertexClientPromise;

  return cachedVertexClient;
}

function createInstrumentedVertexClient(
  vertexClient: VertexClient,
): InstrumentedVertexClient {
  return new Proxy(vertexClient, {
    apply(target, thisArg, argArray) {
      const [modelId, ...rest] = argArray;
      const resolvedArgs =
        typeof modelId === "string"
          ? [resolveVertexModelId(modelId), ...rest]
          : argArray;
      const model = Reflect.apply(target, thisArg, resolvedArgs);
      return wrapModelWithDevTools(model);
    },
  }) as InstrumentedVertexClient;
}

export async function getVertexClient() {
  if (cachedInstrumentedVertexClient) {
    return cachedInstrumentedVertexClient;
  }

  cachedInstrumentedVertexClient = createInstrumentedVertexClient(
    await getOrCreateVertexClient(),
  );

  return cachedInstrumentedVertexClient;
}

export async function getObservableVertexModel(
  modelId: string,
  identity?: VertexDevToolsIdentity,
): Promise<WrappedLanguageModel> {
  const vertexClient = await getOrCreateVertexClient();

  return wrapModelWithDevTools(vertexClient(resolveVertexModelId(modelId)), {
    modelId: identity?.modelId,
    provider: identity?.provider ?? VERTEX_DEVTOOLS_PROVIDER,
  }) as WrappedLanguageModel;
}

export async function getVertexModel(
  model: string,
): Promise<WrappedLanguageModel> {
  await requireAdminAuth();
  const vertex = await getVertexClient();

  return vertex(model) as WrappedLanguageModel;
}

export function getVertexProviderOptions(options: VertexLanguageModelOptions) {
  return {
    vertex: options satisfies VertexLanguageModelOptions,
  };
}

function getThinkingBudgetForLevel(
  thinkingLevel: VertexThinkingConfig["thinkingLevel"],
): number | undefined {
  if (thinkingLevel === "minimal") {
    return 0;
  }
  if (thinkingLevel === "low") {
    return 1024;
  }
  if (thinkingLevel === "medium") {
    return 2048;
  }
  if (thinkingLevel === "high") {
    return 8192;
  }

  return undefined;
}

export function getResolvedVertexThinkingConfig(
  thinkingConfig: VertexThinkingConfig,
  options: VertexThinkingProviderOptions = {},
): VertexThinkingConfig {
  const resolvedModelId = options.modelId
    ? resolveVertexModelId(options.modelId).toLowerCase().trim()
    : "";

  if (!resolvedModelId) {
    return thinkingConfig;
  }

  if (resolvedModelId.startsWith("gemini-2.5")) {
    const { thinkingLevel, ...budgetConfig } = thinkingConfig;
    const thinkingBudget =
      budgetConfig.thinkingBudget ?? getThinkingBudgetForLevel(thinkingLevel);

    return thinkingBudget === undefined
      ? budgetConfig
      : {
          ...budgetConfig,
          thinkingBudget,
        };
  }

  if (resolvedModelId.startsWith("gemini-3")) {
    const { thinkingBudget: _thinkingBudget, ...levelConfig } = thinkingConfig;
    return levelConfig;
  }

  return thinkingConfig;
}

export function getVertexThinkingProviderOptions(
  thinkingConfig: VertexThinkingConfig,
  options: VertexThinkingProviderOptions = {},
) {
  return getVertexProviderOptions({
    thinkingConfig: getResolvedVertexThinkingConfig(thinkingConfig, options),
  });
}

export interface StreamAdminTextOptions {
  model: WrappedLanguageModel;
  messages: ModelMessage[];
  instructions?: string;
  tools?: ToolSet;
  toolLoopTemperature?: number;
  stopWhen?: Parameters<AiStreamText>[0]["stopWhen"];
  maxRetries?: number;
  maxOutputTokens?: number;
  experimental_thinking?: {
    enabled: boolean;
    modelId?: string;
  };
  metering?: {
    channelId?: string;
    context: TenantContext;
    conversationId?: string;
    estimatedTotalTokens?: number;
    firestore: Firestore;
    jobId?: string;
    model?: string;
    provider?: string;
    runId?: string;
    source: AiUsageEventSource;
    userId?: string;
  };
}

export async function streamAdminText(
  options: StreamAdminTextOptions,
): Promise<Awaited<ReturnType<AiStreamText>>> {
  const {
    model,
    messages,
    instructions,
    tools,
    toolLoopTemperature,
    stopWhen,
    maxRetries,
    maxOutputTokens,
    experimental_thinking,
    metering,
  } = options;

  const normalizedModelId =
    experimental_thinking?.modelId?.toLowerCase().trim() ?? "";
  const resolvedThinkingModelId = normalizedModelId
    ? resolveVertexModelId(normalizedModelId).toLowerCase().trim()
    : "";
  const usesThinkingLevel = resolvedThinkingModelId.startsWith("gemini-3");
  const usesThinkingBudget = resolvedThinkingModelId.startsWith("gemini-2.5");
  const isProModel = normalizedModelId.includes("pro");
  const thinkingLevel: "low" | "high" = isProModel ? "high" : "low";

  const thinkingConfig = experimental_thinking?.enabled
    ? usesThinkingLevel
      ? {
          includeThoughts: true,
          thinkingLevel,
        }
      : usesThinkingBudget
        ? {
            includeThoughts: true,
            thinkingBudget: 2048,
          }
        : {
            includeThoughts: true,
          }
    : undefined;

  const { defaultSettingsMiddleware, streamText, wrapLanguageModel } =
    await import("ai");

  const toolEnabledStepModel =
    tools && Object.keys(tools).length > 0 && toolLoopTemperature !== undefined
      ? wrapLanguageModel({
          model,
          middleware: defaultSettingsMiddleware({
            settings: { temperature: toolLoopTemperature },
          }),
        })
      : undefined;

  const reservation = metering
    ? await reserveAiUsage({
        ...metering,
        modality: "text",
        estimatedTotalTokens:
          metering.estimatedTotalTokens ??
          estimateAiUsageTextTokens({ messages, system: instructions }),
      })
    : undefined;

  try {
    return streamText({
      model,
      instructions,
      messages,
      tools,
      stopWhen,
      maxRetries,
      maxOutputTokens,
      prepareStep: toolEnabledStepModel
        ? ({ stepNumber, steps }) => {
            const previousStep = steps[steps.length - 1];

            if (
              stepNumber === 0 ||
              previousStep?.finishReason === "tool-calls"
            ) {
              return {
                model: toolEnabledStepModel,
              };
            }

            return undefined;
          }
        : undefined,
      onEnd:
        reservation && metering
          ? async ({ usage }) => {
              await finalizeAiUsage({
                firestore: metering.firestore,
                reservation,
                textUsage: usage,
              });
            }
          : undefined,
      ...(thinkingConfig
        ? {
            providerOptions: getVertexThinkingProviderOptions(thinkingConfig, {
              modelId: experimental_thinking?.modelId,
            }),
          }
        : {}),
    });
  } catch (error) {
    if (reservation && metering) {
      await releaseAiUsageReservation({
        firestore: metering.firestore,
        reservation,
      });
    }
    throw error;
  }
}
