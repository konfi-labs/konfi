import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";
import type { LanguageModel } from "ai";
import { MODELS } from "@konfi/firebase";

type LanguageModelV4 = ReturnType<(typeof import("ai"))["wrapLanguageModel"]>;
type LanguageModelV4CallOptions = Parameters<LanguageModelV4["doStream"]>[0];
type LanguageModelV4GenerateResult = Awaited<
  ReturnType<LanguageModelV4["doGenerate"]>
>;
type LanguageModelV4StreamResult = Awaited<
  ReturnType<LanguageModelV4["doStream"]>
>;

interface SerializedWorkflowVertexLanguageModel {
  modelId: string;
}

class WorkflowVertexLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = "v4" as const;
  readonly provider = "google-vertex";
  readonly supportedUrls = {};

  constructor(readonly modelId: string) {}

  static [WORKFLOW_SERIALIZE](
    instance: WorkflowVertexLanguageModel,
  ): SerializedWorkflowVertexLanguageModel {
    return { modelId: instance.modelId };
  }

  static [WORKFLOW_DESERIALIZE](
    data: SerializedWorkflowVertexLanguageModel,
  ): WorkflowVertexLanguageModel {
    return new WorkflowVertexLanguageModel(data.modelId);
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    "use step";

    const { getAdminVertexLanguageModel } = await import(
      "@/lib/ai/vertex-language-model.server"
    );
    const model = (await getAdminVertexLanguageModel(
      this.modelId,
    )) as LanguageModelV4;

    return model.doGenerate(options);
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    "use step";

    const { getAdminVertexLanguageModel } = await import(
      "@/lib/ai/vertex-language-model.server"
    );
    const model = (await getAdminVertexLanguageModel(
      this.modelId,
    )) as LanguageModelV4;

    return model.doStream(options);
  }
}

export function createWorkflowVertexLanguageModel(
  _agentId?: string,
): LanguageModel {
  return new WorkflowVertexLanguageModel(MODELS.GEMINI_3_FLASH_LITE);
}
