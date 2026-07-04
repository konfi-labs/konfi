import "server-only";

import { getVertexConfig } from "@/lib/ai/server-vertex-config";
import type { AiUsageTextUsage } from "@/lib/ai/usage-metering";
import { resolveVertexModelId } from "@/lib/ai/vertex-model-ids";
import { GoogleAuth } from "google-auth-library";

type VertexInlineDataPart = {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

type VertexTextPart = {
  text: string;
};

type VertexPart = VertexInlineDataPart | VertexTextPart;

type VertexContent = {
  role?: "user";
  parts: VertexPart[];
};

type VertexResponsePart = {
  inlineData?: {
    data?: unknown;
    mimeType?: unknown;
  };
  text?: unknown;
};

type VertexResponseCandidate = {
  content?: {
    parts?: VertexResponsePart[];
  };
  finishReason?: unknown;
};

type VertexGenerateContentResponse = {
  candidates?: VertexResponseCandidate[];
  usageMetadata?: {
    cachedContentTokenCount?: unknown;
    candidatesTokenCount?: unknown;
    promptTokenCount?: unknown;
    thoughtsTokenCount?: unknown;
    totalTokenCount?: unknown;
  };
};

export type VertexRestPrompt =
  | string
  | {
      images: Array<{ base64: string; mimeType: string }>;
      text: string;
    };

export type VertexRestGenerationConfig = {
  imageConfig?: {
    aspectRatio?: string;
    imageSize?: string;
  };
  responseMimeType?: string;
  responseModalities?: string[];
  temperature?: number;
};

export type VertexRestGeneratedFile = {
  base64: string;
  mediaType: string;
};

export type VertexRestGenerateContentResult = {
  files: VertexRestGeneratedFile[];
  text: string;
  usage: AiUsageTextUsage;
};

type VertexEndpoint = {
  requestedModel: string;
  url: string;
  vertexModel: string;
};

const DEFAULT_VERTEX_GENERATE_CONTENT_TIMEOUT_MS = 120_000;

let cachedGoogleAuth: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth {
  if (cachedGoogleAuth) {
    return cachedGoogleAuth;
  }

  const { clientEmail, privateKey } = getVertexConfig();

  cachedGoogleAuth = new GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  return cachedGoogleAuth;
}

function getVertexGenerateContentEndpoint(model: string): VertexEndpoint {
  const { project, location } = getVertexConfig();
  const vertexModel = resolveVertexModelId(model);
  const host =
    location === "global"
      ? "aiplatform.googleapis.com"
      : location === "eu" || location === "us"
        ? `aiplatform.${location}.rep.googleapis.com`
        : `${location}-aiplatform.googleapis.com`;

  return {
    requestedModel: model,
    url: `https://${host}/v1beta1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(vertexModel)}:generateContent`,
    vertexModel,
  };
}

function toVertexContents(prompt: VertexRestPrompt): VertexContent[] {
  if (typeof prompt === "string") {
    return [{ role: "user", parts: [{ text: prompt }] }];
  }

  return [
    {
      role: "user",
      parts: [
        { text: prompt.text },
        ...prompt.images.map<VertexInlineDataPart>((image) => ({
          inlineData: {
            data: image.base64.includes(",")
              ? (image.base64.split(",")[1] ?? "")
              : image.base64,
            mimeType: image.mimeType,
          },
        })),
      ],
    },
  ];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined;
}

function getUsage(
  usageMetadata: VertexGenerateContentResponse["usageMetadata"],
): AiUsageTextUsage {
  return {
    cachedInputTokens: asNumber(usageMetadata?.cachedContentTokenCount),
    inputTokens: asNumber(usageMetadata?.promptTokenCount),
    outputTokens: asNumber(usageMetadata?.candidatesTokenCount),
    reasoningTokens: asNumber(usageMetadata?.thoughtsTokenCount),
    totalTokens: asNumber(usageMetadata?.totalTokenCount),
  };
}

function parseVertexResponse(value: unknown): VertexGenerateContentResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Vertex AI returned an invalid response.");
  }

  return value as VertexGenerateContentResponse;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getFetchFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (!cause) {
    return error.message;
  }

  if (cause instanceof Error) {
    return `${error.message}; cause: ${cause.message}`;
  }

  return `${error.message}; cause: ${String(cause)}`;
}

function isNetworkFetchError(error: unknown): boolean {
  return error instanceof TypeError && error.message === "fetch failed";
}

function getTimeoutMs(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_VERTEX_GENERATE_CONTENT_TIMEOUT_MS;
  }

  return Math.max(1, Math.floor(timeoutMs));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateVertexContent(params: {
  generationConfig?: VertexRestGenerationConfig;
  model: string;
  prompt: VertexRestPrompt;
  system?: string;
  timeoutMs?: number;
}): Promise<VertexRestGenerateContentResult> {
  const endpoint = getVertexGenerateContentEndpoint(params.model);
  const client = await getGoogleAuth().getClient();
  const authHeaders = await client.getRequestHeaders(endpoint.url);
  const headers = new Headers(authHeaders as HeadersInit);
  headers.set("content-type", "application/json");

  const body: Record<string, unknown> = {
    contents: toVertexContents(params.prompt),
    ...(params.system
      ? {
          systemInstruction: {
            parts: [{ text: params.system }],
          },
        }
      : {}),
    ...(params.generationConfig
      ? { generationConfig: params.generationConfig }
      : {}),
  };

  const bodyJson = JSON.stringify(body);
  const maxAttempts = 3;
  const timeoutMs = getTimeoutMs(params.timeoutMs);
  let response: Response | undefined;
  let lastFetchError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let abortedByTimeout = false;
    const timeoutId = setTimeout(() => {
      abortedByTimeout = true;
      controller.abort();
    }, timeoutMs);

    try {
      response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: bodyJson,
        signal: controller.signal,
      });
      lastFetchError = undefined;
      break;
    } catch (error) {
      lastFetchError = abortedByTimeout
        ? new Error(`Vertex AI request timed out after ${timeoutMs}ms.`, {
            cause: error,
          })
        : error;

      if (
        abortedByTimeout ||
        !isNetworkFetchError(error) ||
        attempt === maxAttempts
      ) {
        break;
      }

      await sleep(250 * attempt);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!response) {
    throw new Error(
      [
        "Vertex AI request failed before receiving a response.",
        `model=${endpoint.requestedModel}`,
        `vertexModel=${endpoint.vertexModel}`,
        `host=${new URL(endpoint.url).host}`,
        `details=${getFetchFailureMessage(lastFetchError)}`,
      ].join(" "),
      { cause: lastFetchError },
    );
  }

  const responseText = await response.text();
  let responseJson: unknown;

  try {
    responseJson = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseJson = undefined;
  }

  if (!response.ok) {
    throw new Error(
      [
        `Vertex AI request failed with HTTP ${response.status}.`,
        `model=${endpoint.requestedModel}`,
        `vertexModel=${endpoint.vertexModel}`,
        `host=${new URL(endpoint.url).host}`,
        `details=${responseText || getErrorMessage(responseJson)}`,
      ].join(" "),
    );
  }

  const parsed = parseVertexResponse(responseJson);
  const parts =
    parsed.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ??
    [];

  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  const files = parts.reduce<VertexRestGeneratedFile[]>((acc, part) => {
    const data = part.inlineData?.data;
    const mimeType = part.inlineData?.mimeType;

    if (typeof data === "string" && typeof mimeType === "string") {
      acc.push({ base64: data, mediaType: mimeType });
    }

    return acc;
  }, []);

  return {
    files,
    text,
    usage: getUsage(parsed.usageMetadata),
  };
}

export function parseVertexJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fencedMatch?.[1]?.trim() ?? trimmed;

  return JSON.parse(jsonText);
}
