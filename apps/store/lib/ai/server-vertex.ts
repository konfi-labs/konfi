import "server-only";

import { wrapModelWithDevTools } from "./devtools";

type JsonValue =
  | boolean
  | null
  | number
  | string
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];
type StoreVertexThinkingConfig = {
  includeThoughts?: boolean;
  thinkingBudget?: number;
  thinkingLevel?: "high" | "low" | "medium" | "minimal";
};
type StoreVertexProviderOptions = {
  thinkingConfig?: StoreVertexThinkingConfig;
  [key: string]: JsonValue | undefined;
};
type LanguageModel = Parameters<typeof wrapModelWithDevTools>[0];
type EmbeddingModel = Parameters<(typeof import("ai"))["embed"]>[0]["model"];
type VertexClient = ((model: string) => LanguageModel) & {
  embeddingModel: (model: string) => EmbeddingModel;
};
type InstrumentedVertexClient = VertexClient;
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

let cachedVertexClient: VertexClient | null = null;
let cachedInstrumentedVertexClient: InstrumentedVertexClient | null = null;
const GOOGLE_VERTEX_PACKAGE = "@ai-sdk/" + "google-vertex";

async function getOrCreateStoreVertexClient(): Promise<VertexClient> {
  if (cachedVertexClient) {
    return cachedVertexClient;
  }

  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;

  if (!project) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID for Vertex AI.");
  }

  if (!clientEmail) {
    throw new Error("Missing ADMIN_FIREBASE_CLIENT_EMAIL for Vertex AI.");
  }

  if (!privateKeyRaw) {
    throw new Error("Missing ADMIN_FIREBASE_SERVICE_ACCOUNT for Vertex AI.");
  }

  const { createVertex } = (await import(GOOGLE_VERTEX_PACKAGE)) as unknown as {
    createVertex: CreateVertex;
  };

  cachedVertexClient = createVertex({
    project,
    location: "global",
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKeyRaw.replace(/\\n/g, "\n"),
      },
    },
  });

  return cachedVertexClient;
}

function createInstrumentedVertexClient(
  vertexClient: VertexClient,
): InstrumentedVertexClient {
  return new Proxy(vertexClient, {
    apply(target, thisArg, argArray) {
      const model = Reflect.apply(target, thisArg, argArray);
      return wrapModelWithDevTools(model, {
        provider: "google-vertex",
      });
    },
  }) as InstrumentedVertexClient;
}

export async function getStoreVertexClient(): Promise<VertexClient> {
  if (cachedInstrumentedVertexClient) {
    return cachedInstrumentedVertexClient;
  }

  cachedInstrumentedVertexClient = createInstrumentedVertexClient(
    await getOrCreateStoreVertexClient(),
  );

  return cachedInstrumentedVertexClient;
}

export function getStoreVertexProviderOptions(
  options: StoreVertexProviderOptions,
) {
  return {
    vertex: options satisfies StoreVertexProviderOptions,
  };
}

export function getStoreVertexThinkingProviderOptions(
  thinkingConfig: StoreVertexThinkingConfig,
) {
  return getStoreVertexProviderOptions({
    thinkingConfig,
  });
}
