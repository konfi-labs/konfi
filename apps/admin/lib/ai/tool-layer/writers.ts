import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  type DocumentData,
  Firestore as AdminFirestore,
  FieldValue,
} from "firebase-admin/firestore";
import { removeUndefined } from "@konfi/utils";
import { ToolLayerError } from "./errors";
import type {
  SaveDraftRecordInput,
  SaveDraftRecordOutput,
  ToolLayerWriters,
} from "./types";

function getAdminFirestore(): AdminFirestore {
  return getAdminDb();
}

function readStringField(
  data: DocumentData | undefined,
  field: string,
): string | undefined {
  const value = data?.[field];
  return typeof value === "string" ? value : undefined;
}

function buildDraftPayload(input: {
  createdAt: unknown;
  input: SaveDraftRecordInput;
  runId: string;
  tenantId?: string;
}) {
  return removeUndefined({
    channelId: input.input.channelId,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    completedAt: FieldValue.serverTimestamp(),
    createdAt: input.createdAt,
    createdBy: input.input.createdBy,
    messages: input.input.messages,
    prompt: input.input.prompt,
    result: input.input.result,
    runId: input.runId,
    source: "mcp",
    status: "completed",
    summary: input.input.summary,
    taskType: input.input.draftType,
    updatedAt: FieldValue.serverTimestamp(),
    workflowStatus: "mcp_draft",
  });
}

function assertEditableMcpDraft(input: {
  data: DocumentData | undefined;
  draftType: SaveDraftRecordInput["draftType"];
  channelId?: string;
  tenantId?: string;
}) {
  const source = readStringField(input.data, "source");
  const workflowStatus = readStringField(input.data, "workflowStatus");
  const taskType = readStringField(input.data, "taskType");
  const channelId = readStringField(input.data, "channelId");
  const tenantId = readStringField(input.data, "tenantId");

  if (
    source !== "mcp" ||
    workflowStatus !== "mcp_draft" ||
    taskType !== input.draftType ||
    channelId !== input.channelId ||
    (tenantId && input.tenantId && tenantId !== input.tenantId)
  ) {
    throw new ToolLayerError(
      "resource_denied",
      "Only matching MCP draft records can be edited.",
    );
  }
}

export function createFirestoreToolLayerWriters(
  firestore: AdminFirestore = getAdminFirestore(),
  options: {
    tenantId?: string;
  } = {},
): ToolLayerWriters {
  const tenantId = options.tenantId;

  return {
    saveDraftRecord: async (
      input: SaveDraftRecordInput,
    ): Promise<SaveDraftRecordOutput> => {
      const draftRef = input.existingRunId
        ? firestore.collection("agents").doc(input.existingRunId)
        : firestore.collection("agents").doc();
      const runId = draftRef.id;

      if (input.existingRunId) {
        await firestore.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(draftRef);

          if (!snapshot.exists) {
            throw new ToolLayerError("not_found", "Draft record not found.");
          }

          const data = snapshot.data();
          const existingTenantId = readStringField(data, "tenantId");
          const payloadTenantId = tenantId ?? existingTenantId;
          assertEditableMcpDraft({
            channelId: input.channelId,
            data,
            draftType: input.draftType,
            ...(tenantId ? { tenantId } : {}),
          });

          transaction.set(
            draftRef,
            buildDraftPayload({
              createdAt: data?.createdAt ?? FieldValue.serverTimestamp(),
              input,
              runId,
              ...(payloadTenantId ? { tenantId: payloadTenantId } : {}),
            }),
          );
        });
      } else {
        await draftRef.set(
          buildDraftPayload({
            createdAt: FieldValue.serverTimestamp(),
            input,
            runId,
            ...(tenantId ? { tenantId } : {}),
          }),
        );
      }

      return { runId };
    },
  };
}
