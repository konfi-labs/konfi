"use server";

import "server-only";

import {
  AdminAuthError,
  getAuthenticatedAdminMember,
  requireTenantAdminChannelAccess,
  requireTenantOwnerOrSuperAdminAuth,
} from "@/actions/auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { tenantFirestorePaths, withTenantId } from "@konfi/firebase";
import type { AiInstructionSettings } from "@konfi/types";
import {
  AI_INSTRUCTIONS_SETTINGS_DOC_ID,
  type PartialAiInstructionSettings,
  normalizeAiInstructionSettings,
} from "@konfi/utils";
import { FieldValue } from "firebase-admin/firestore";

export interface AiInstructionSettingsView {
  settings: AiInstructionSettings;
  updatedAt: string | null;
  updatedBy?: {
    id: string;
    name?: string;
  };
}

export interface SaveAiInstructionSettingsInput {
  channelId: string;
  settings: PartialAiInstructionSettings;
}

export type AiInstructionSettingsActionResult =
  | {
      ok: true;
      view: AiInstructionSettingsView;
    }
  | {
      ok: false;
      error: {
        code: "FORBIDDEN";
        message: string;
        statusCode: 403;
      };
    };

function normalizeChannelId(channelId: string): string {
  const trimmed = channelId.trim();
  if (!trimmed || trimmed.includes("/")) {
    throw new Error("Channel ID is required.");
  }

  return trimmed;
}

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as { toDate?: unknown; toMillis?: unknown };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return date instanceof Date ? date.toISOString() : null;
    }
    if (typeof candidate.toMillis === "function") {
      return new Date(candidate.toMillis()).toISOString();
    }
  }

  return null;
}

function isExpectedAiInstructionsAuthError(
  error: unknown,
): error is AdminAuthError {
  return (
    error instanceof AdminAuthError &&
    error.statusCode === 403 &&
    (error.message === "Tenant owner access is required" ||
      error.message === "Tenant channel access is required")
  );
}

function toAiInstructionsAuthFailure(
  error: AdminAuthError,
): AiInstructionSettingsActionResult {
  return {
    ok: false,
    error: {
      code: "FORBIDDEN",
      message: error.message,
      statusCode: 403,
    },
  };
}

async function assertChannelExists(channelId: string) {
  const snapshot = await getAdminDb().doc(`channels/${channelId}`).get();
  if (!snapshot.exists) {
    throw new Error("Channel not found.");
  }
}

async function authorizeAiInstructionSettings(channelId: string) {
  const [authContext, authorizedChannelId] = await Promise.all([
    requireTenantOwnerOrSuperAdminAuth(),
    requireTenantAdminChannelAccess(channelId),
  ]);

  await assertChannelExists(authorizedChannelId);

  return {
    authorizedChannelId,
    tenantContext: authContext.tenantContext,
  };
}

export async function getAiInstructionSettingsAction(
  channelId: string,
): Promise<AiInstructionSettingsActionResult> {
  try {
    const normalizedChannelId = normalizeChannelId(channelId);
    const { authorizedChannelId, tenantContext } =
      await authorizeAiInstructionSettings(normalizedChannelId);
    const snapshot = await getAdminDb()
      .doc(
        tenantFirestorePaths.settingsDoc(
          tenantContext,
          authorizedChannelId,
          AI_INSTRUCTIONS_SETTINGS_DOC_ID,
        ),
      )
      .get();
    const settings = normalizeAiInstructionSettings(
      snapshot.exists
        ? (snapshot.data() as PartialAiInstructionSettings)
        : null,
    );

    return {
      ok: true,
      view: {
        settings,
        updatedAt: toIsoString(settings.updatedAt),
        updatedBy: settings.updatedBy,
      },
    };
  } catch (error) {
    if (isExpectedAiInstructionsAuthError(error)) {
      return toAiInstructionsAuthFailure(error);
    }

    throw error;
  }
}

export async function saveAiInstructionSettingsAction({
  channelId,
  settings,
}: SaveAiInstructionSettingsInput): Promise<AiInstructionSettingsActionResult> {
  try {
    const normalizedChannelId = normalizeChannelId(channelId);
    const { authorizedChannelId, tenantContext } =
      await authorizeAiInstructionSettings(normalizedChannelId);
    const actor = await getAuthenticatedAdminMember();
    const normalizedSettings = normalizeAiInstructionSettings(settings);
    const settingsRef = getAdminDb().doc(
      tenantFirestorePaths.settingsDoc(
        tenantContext,
        authorizedChannelId,
        AI_INSTRUCTIONS_SETTINGS_DOC_ID,
      ),
    );
    const updatedBy = {
      id: actor.id,
      name: actor.name,
    };
    const data = withTenantId(
      {
        ...normalizedSettings,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy,
      },
      tenantContext,
      "AI instruction settings write",
    );

    await settingsRef.set(data, { merge: true });
    await settingsRef.collection("revisions").add({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: updatedBy,
    });

    return getAiInstructionSettingsAction(authorizedChannelId);
  } catch (error) {
    if (isExpectedAiInstructionsAuthError(error)) {
      return toAiInstructionsAuthFailure(error);
    }

    throw error;
  }
}
