import "server-only";

import { devToolsMiddleware } from "@ai-sdk/devtools";
import { wrapLanguageModel } from "ai";

type LanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];

interface DevToolsModelIdentity {
  modelId?: string;
  provider?: string;
}

const wrappedModels = new WeakMap<object, Map<string, LanguageModel>>();

function canCacheLanguageModel(
  value: LanguageModel,
): value is LanguageModel & object {
  return typeof value === "object" || typeof value === "function";
}

function getModelCacheKey(identity?: DevToolsModelIdentity): string {
  return JSON.stringify({
    modelId: identity?.modelId ?? null,
    provider: identity?.provider ?? null,
  });
}

export function isAiDevToolsEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function wrapModelWithDevTools<TModel extends LanguageModel>(
  model: TModel,
  identity?: DevToolsModelIdentity,
): TModel {
  if (!isAiDevToolsEnabled()) {
    return model;
  }

  const cacheKey = getModelCacheKey(identity);
  const wrapOptions = {
    model,
    middleware: devToolsMiddleware(),
    ...(identity?.modelId ? { modelId: identity.modelId } : {}),
    ...(identity?.provider ? { providerId: identity.provider } : {}),
  };

  if (!canCacheLanguageModel(model)) {
    return wrapLanguageModel(wrapOptions) as TModel;
  }

  const cachedModel = wrappedModels.get(model)?.get(cacheKey);
  if (cachedModel) {
    return cachedModel as TModel;
  }

  const wrappedModel = wrapLanguageModel(wrapOptions);

  const cachedModels =
    wrappedModels.get(model) ?? new Map<string, LanguageModel>();
  cachedModels.set(cacheKey, wrappedModel);
  wrappedModels.set(model, cachedModels);

  return wrappedModel as TModel;
}
