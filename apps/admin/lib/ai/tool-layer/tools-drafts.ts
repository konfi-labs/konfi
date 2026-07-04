import "server-only";

import { ToolLayerError } from "./errors";
import {
  requireAnyScope,
  requireChannelAccess,
  requireScopes,
} from "./permissions";
import { auditToolCall } from "./audit";
import {
  getBusinessResourceDescriptor,
  sanitizeBusinessRecordData,
  summarizeBusinessRecord,
} from "./business-resources";
import type {
  DraftResourceOptionsOutput,
  DraftSchemaOutput,
  KonfiDraftingDocsOutput,
  SavedBusinessUpdateDraftOutput,
  SavedDraftOutput,
  SavedDraftRecordOutput,
  ToolLayerRuntime,
} from "./types";
import {
  normalizeBusinessUpdateChanges,
  optionalDraftRunId,
  requireNonEmpty,
  resolveToolChannel,
} from "./tool-helpers";
import {
  actorMember,
  buildBusinessUpdateDraftResult,
  buildBusinessUpdatePrompt,
  buildBusinessUpdateSummary,
  buildDraftPrompt,
  buildDraftSummary,
  isToolTaskType,
  openUrlForBusinessUpdateDraft,
  openUrlForDraft,
  openUrlForSavedDraft,
} from "./catalog-changes";
import { buildSavedDraftResult } from "./draft-results";
import { draftingDocs } from "./drafting-docs";
import { buildDraftResourceOptions, draftSchema } from "./draft-schema";
import type {
  GetDraftResourceOptionsInput,
  GetDraftSchemaInput,
  GetKonfiDraftingDocsInput,
  GetSavedDraftInput,
  SaveBusinessUpdateDraftInput,
  SaveDraftInput,
} from "./tool-inputs";

export async function getDraftSchema(
  runtime: ToolLayerRuntime,
  input: GetDraftSchemaInput,
): Promise<DraftSchemaOutput> {
  return auditToolCall({
    inputSummary: {
      draftType: input.draftType,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["drafts:preview"]);
      return draftSchema(input.draftType);
    },
    outputSummary: (result) => ({
      fields: result.fields.length,
      itemFields: result.itemFields?.length ?? 0,
    }),
    requestedScopes: ["drafts:preview"],
    runtime,
    toolName: "getDraftSchema",
  });
}

export async function getKonfiDraftingDocs(
  runtime: ToolLayerRuntime,
  input: GetKonfiDraftingDocsInput = {},
): Promise<KonfiDraftingDocsOutput> {
  const topic = input.topic ?? "overview";

  return auditToolCall({
    inputSummary: {
      topic,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["drafts:preview"]);
      return draftingDocs(topic);
    },
    outputSummary: (result) => ({
      priceTypes: result.priceTypes?.length ?? 0,
      sections: result.sections.length,
      topic: result.topic,
    }),
    requestedScopes: ["drafts:preview"],
    runtime,
    toolName: "getKonfiDraftingDocs",
  });
}

export async function getDraftResourceOptions(
  runtime: ToolLayerRuntime,
  input: GetDraftResourceOptionsInput,
): Promise<DraftResourceOptionsOutput> {
  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      draftType: input.draftType,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["drafts:preview"]);
      return buildDraftResourceOptions(runtime, input);
    },
    outputSummary: (result) => ({
      attributes: result.attributes?.length ?? 0,
      categories: result.categories?.length ?? 0,
      productTypes: result.productTypes?.length ?? 0,
    }),
    requestedScopes: ["drafts:preview"],
    runtime,
    toolName: "getDraftResourceOptions",
  });
}

export async function saveDraft(
  runtime: ToolLayerRuntime,
  input: SaveDraftInput,
): Promise<SavedDraftOutput> {
  const prompt = buildDraftPrompt(input);
  const summary = buildDraftSummary(input);
  const draftRunId = optionalDraftRunId(input.draftRunId);

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      draftRunId: draftRunId ?? null,
      draftType: input.draftType,
      title: prompt,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["drafts:write"]);
      if (
        input.draftType === "category" ||
        input.draftType === "product" ||
        input.draftType === "productType"
      ) {
        requireScopes(runtime.auth, ["products:write"]);
      }
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      if (!runtime.writers) {
        throw new Error("Tool-layer writers are not configured.");
      }

      const result = buildSavedDraftResult({
        draft: input.draft,
        draftType: input.draftType,
        prompt,
        summary,
      });
      const { runId } = await runtime.writers.saveDraftRecord({
        channelId,
        createdBy: actorMember(runtime.auth),
        draftType: input.draftType,
        ...(draftRunId ? { existingRunId: draftRunId } : {}),
        messages: [
          {
            content: prompt,
            role: "user",
          },
          {
            content: summary,
            role: "assistant",
          },
        ],
        prompt,
        result,
        summary,
      });

      return {
        channelId,
        draftType: input.draftType,
        openUrl: openUrlForDraft(input.draftType, runId),
        runId,
        status: "completed",
      };
    },
    outputSummary: (result) => ({
      draftType: result.draftType,
      runId: result.runId,
    }),
    requestedScopes:
      input.draftType === "category" ||
      input.draftType === "product" ||
      input.draftType === "productType"
        ? ["drafts:write", "products:write"]
        : ["drafts:write"],
    runtime,
    toolName: "saveDraft",
  });
}

export async function saveBusinessUpdateDraft(
  runtime: ToolLayerRuntime,
  input: SaveBusinessUpdateDraftInput,
): Promise<SavedBusinessUpdateDraftOutput> {
  const descriptor = getBusinessResourceDescriptor(input.resource);
  const draftRunId = optionalDraftRunId(input.draftRunId);
  const recordId = requireNonEmpty(input.recordId, "recordId");
  const changes = normalizeBusinessUpdateChanges(input.changes);
  const prompt = buildBusinessUpdatePrompt({ descriptor, input });
  const summary = buildBusinessUpdateSummary({
    changeCount: changes.length,
    descriptor,
    input,
  });

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      changeCount: changes.length,
      draftRunId: draftRunId ?? null,
      recordId,
      resource: input.resource,
      title: prompt,
    },
    operation: async () => {
      requireScopes(runtime.auth, [
        "business:read",
        "business:write",
        "drafts:write",
      ]);
      const channelId = descriptor.channelScoped
        ? await resolveToolChannel(runtime, input)
        : undefined;

      if (channelId) {
        requireChannelAccess(runtime.auth, channelId);
      }

      if (!runtime.writers) {
        throw new Error("Tool-layer writers are not configured.");
      }

      const record = await runtime.readers.getBusinessRecord({
        ...(channelId ? { channelId } : {}),
        recordId,
        resource: input.resource,
      });

      if (!record) {
        throw new ToolLayerError("not_found", "Business record not found.");
      }

      const summarizedRecord = {
        ...summarizeBusinessRecord(descriptor, record),
        data: sanitizeBusinessRecordData(record.data),
        ...(record.path ? { path: record.path } : {}),
      };
      const result = buildBusinessUpdateDraftResult({
        ...(channelId ? { channelId } : {}),
        changes,
        descriptor,
        record: summarizedRecord,
        summary,
      });
      const { runId } = await runtime.writers.saveDraftRecord({
        ...(channelId ? { channelId } : {}),
        createdBy: actorMember(runtime.auth),
        draftType: "businessUpdate",
        ...(draftRunId ? { existingRunId: draftRunId } : {}),
        messages: [
          {
            content: prompt,
            role: "user",
          },
          {
            content: summary,
            role: "assistant",
          },
        ],
        prompt,
        result,
        summary,
      });

      return {
        ...(channelId ? { channelId } : {}),
        openUrl: openUrlForBusinessUpdateDraft(runId),
        recordId,
        resource: input.resource,
        runId,
        status: "completed",
      };
    },
    outputSummary: (result) => ({
      changeCount: changes.length,
      recordId: result.recordId,
      resource: result.resource,
      runId: result.runId,
    }),
    requestedScopes: ["business:read", "business:write", "drafts:write"],
    runtime,
    toolName: "saveBusinessUpdateDraft",
  });
}

export async function getSavedDraft(
  runtime: ToolLayerRuntime,
  input: GetSavedDraftInput,
): Promise<SavedDraftRecordOutput> {
  const draftRunId = optionalDraftRunId(input.draftRunId);

  if (!draftRunId) {
    throw new ToolLayerError("validation_error", "draftRunId is required.");
  }

  return auditToolCall({
    inputSummary: {
      draftRunId,
    },
    operation: async () => {
      requireAnyScope(runtime.auth, ["drafts:preview", "drafts:write"]);

      const record = await runtime.readers.getDraftRecord({
        runId: draftRunId,
      });

      if (!record) {
        throw new ToolLayerError("not_found", "Draft record not found.");
      }

      if (
        record.source !== "mcp" ||
        record.workflowStatus !== "mcp_draft" ||
        !isToolTaskType(record.taskType)
      ) {
        throw new ToolLayerError(
          "resource_denied",
          "Only MCP draft records can be read.",
        );
      }

      if (record.channelId) {
        requireChannelAccess(runtime.auth, record.channelId);
      }

      if (
        !runtime.auth.permissions.isSuperAdmin &&
        record.createdBy?.id !== runtime.auth.actor.uid
      ) {
        throw new ToolLayerError(
          "resource_denied",
          "Only the MCP actor that created this draft can read it back.",
        );
      }

      return {
        ...(record.channelId ? { channelId: record.channelId } : {}),
        draftType: record.taskType,
        openUrl: openUrlForSavedDraft(record.taskType, record.runId),
        result: record.result,
        runId: record.runId,
        status: record.status ?? "completed",
        ...(record.summary ? { summary: record.summary } : {}),
      };
    },
    outputSummary: (result) => ({
      draftType: result.draftType,
      runId: result.runId,
    }),
    requestedScopes: ["drafts:preview", "drafts:write"],
    runtime,
    toolName: "getSavedDraft",
  });
}
