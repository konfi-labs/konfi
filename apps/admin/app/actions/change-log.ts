"use server";

import "server-only";

import { requireAdminAuth } from "@/actions/auth-utils";
import { detectAndDescribeChanges } from "@/lib/ai/change-descriptions";
import {
  createChangeSnapshot,
  type ChangeSnapshot,
} from "@/lib/change-snapshot";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { EntityType } from "@konfi/types";

import { after } from "next/server";

export interface ScheduleChangeLogAfterSubmitInput {
  entityType: EntityType;
  entityId: string;
  channelId?: string;
  before: ChangeSnapshot | null;
}

function isSupportedEntityType(value: EntityType): boolean {
  return (
    value === EntityType.Attribute ||
    value === EntityType.ProductType ||
    value === EntityType.Product
  );
}

function getDocumentPath(input: ScheduleChangeLogAfterSubmitInput): string {
  const entityId = input.entityId.trim();

  if (!entityId) {
    throw new Error("Entity ID is required for change log generation.");
  }

  switch (input.entityType) {
    case EntityType.Attribute:
      return `attributes/${entityId}`;
    case EntityType.ProductType:
      return `productTypes/${entityId}`;
    case EntityType.Product: {
      const channelId = input.channelId?.trim();
      if (!channelId) {
        throw new Error("Channel ID is required for product change logs.");
      }
      return `channels/${channelId}/products/${entityId}`;
    }
    default:
      throw new Error(
        `Unsupported entity type for change logs: ${input.entityType}`,
      );
  }
}

async function readCurrentSnapshot(
  documentPath: string,
): Promise<ChangeSnapshot | null> {
  const snapshot = await getAdminDb().doc(documentPath).get();

  if (!snapshot.exists) {
    return null;
  }

  return createChangeSnapshot(snapshot.data());
}

export async function scheduleChangeLogAfterFormSubmit(
  input: ScheduleChangeLogAfterSubmitInput,
): Promise<void> {
  await requireAdminAuth();

  if (!isSupportedEntityType(input.entityType)) {
    throw new Error(
      `Unsupported entity type for change logs: ${input.entityType}`,
    );
  }

  const before = input.before;
  const documentPath = getDocumentPath(input);
  const entityType = input.entityType;
  const entityId = input.entityId.trim();
  const channelId = input.channelId?.trim();

  after(async () => {
    try {
      const current = await readCurrentSnapshot(documentPath);
      const result = await detectAndDescribeChanges(before, current, {
        entityType,
        entityId,
        channelId,
      });

      if (result) {
        console.info("[changeLog] Change log generated", {
          entityType,
          entityId,
          channelId,
          changeCount: result.changeCount,
        });
      }
    } catch (error) {
      console.error("[changeLog] Failed to generate change log", {
        error,
        entityType,
        entityId,
        channelId,
      });
    }
  });
}
