import "server-only";

import { wrapModelWithDevTools } from "@/lib/ai/devtools";
import { getVertexConfig } from "@/lib/ai/server-vertex-config";
import { resolveVertexModelId } from "@/lib/ai/vertex-model-ids";

type GenerateTextOptions = Parameters<(typeof import("ai"))["generateText"]>[0];
type AiWrapLanguageModel = (typeof import("ai"))["wrapLanguageModel"];
type WrappedLanguageModel = ReturnType<AiWrapLanguageModel>;
type VertexClient = (model: string) => WrappedLanguageModel;
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

export type AdminVertexLanguageModel = GenerateTextOptions["model"];

let cachedVertexClient: VertexClient | null = null;
const GOOGLE_VERTEX_PACKAGE = "@ai-sdk/" + "google-vertex";

async function getOrCreateVertexClient(): Promise<VertexClient> {
  if (cachedVertexClient) {
    return cachedVertexClient;
  }

  const { createVertex } = (await import(GOOGLE_VERTEX_PACKAGE)) as unknown as {
    createVertex: CreateVertex;
  };
  const { project, location, clientEmail, privateKey } = getVertexConfig();

  cachedVertexClient = createVertex({
    project,
    location,
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    },
  });

  return cachedVertexClient;
}

export async function getAdminVertexLanguageModel(
  modelId: string,
): Promise<AdminVertexLanguageModel> {
  const vertexClient = await getOrCreateVertexClient();
  const vertexModelId = resolveVertexModelId(modelId);

  return wrapModelWithDevTools(vertexClient(vertexModelId), {
    modelId,
    provider: "google-vertex",
  }) as AdminVertexLanguageModel;
}
