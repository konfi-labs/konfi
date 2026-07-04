import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import { Locale } from "@konfi/types";
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
} from "firebase-admin/firestore";
import type { StorefrontAssistantResponse } from "./types";

const ASSISTANT_CONVERSATIONS_COLLECTION = "assistantConversations";
const STOREFRONT_ASSISTANT_SOURCE = "storefront-assistant";
const MAX_TITLE_LENGTH = 80;

interface StorefrontAssistantConversationDocument {
  active?: boolean;
  channelId?: string;
  userId?: string;
}

interface PersistStorefrontAssistantTurnInput {
  channelId: string;
  conversationId?: string;
  locale: Locale;
  message: string;
  response: StorefrontAssistantResponse;
  uid: string;
}

function createConversationTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TITLE_LENGTH) {
    return normalized || "Storefront assistant chat";
  }

  return `${normalized.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...`;
}

function textPart(text: string) {
  return [{ type: "text" as const, text }];
}

function removeUndefined(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => removeUndefined(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)]),
    );
  }

  return value;
}

function firestoreData(data: Record<string, unknown>): Record<string, unknown> {
  return removeUndefined(data) as Record<string, unknown>;
}

async function getExistingConversationRef({
  channelId,
  conversationId,
  uid,
}: {
  channelId: string;
  conversationId?: string;
  uid: string;
}): Promise<DocumentReference | undefined> {
  if (!conversationId) return undefined;

  const conversationRef = getAdminDb()
    .collection(ASSISTANT_CONVERSATIONS_COLLECTION)
    .doc(conversationId);
  const snapshot = await conversationRef.get();
  if (!snapshot.exists) return undefined;

  const data = snapshot.data() as
    | StorefrontAssistantConversationDocument
    | undefined;
  if (
    data?.userId !== uid ||
    data.channelId !== channelId ||
    data.active === false
  ) {
    return undefined;
  }

  return conversationRef;
}

export async function persistStorefrontAssistantTurn({
  channelId,
  conversationId,
  locale,
  message,
  response,
  uid,
}: PersistStorefrontAssistantTurnInput): Promise<string> {
  const db = getAdminDb();
  const existingConversationRef = await getExistingConversationRef({
    channelId,
    conversationId,
    uid,
  });
  const conversationRef =
    existingConversationRef ??
    db.collection(ASSISTANT_CONVERSATIONS_COLLECTION).doc();
  const now = Timestamp.now();
  const userMessageRef = conversationRef.collection("messages").doc();
  const assistantMessageRef = conversationRef.collection("messages").doc();
  const batch = db.batch();

  if (!existingConversationRef) {
    batch.set(conversationRef, {
      active: true,
      channelId,
      createdAt: now,
      lastMessageAt: now,
      locale,
      messageCount: 2,
      modelId: MODELS.GEMINI_3_FLASH_LITE,
      source: STOREFRONT_ASSISTANT_SOURCE,
      title: createConversationTitle(message),
      updatedAt: now,
      userId: uid,
    });
  } else {
    batch.set(
      conversationRef,
      {
        lastMessageAt: now,
        messageCount: FieldValue.increment(2),
        updatedAt: now,
      },
      { merge: true },
    );
  }

  batch.set(
    userMessageRef,
    firestoreData({
      conversationId: conversationRef.id,
      locale,
      parts: textPart(message),
      role: "user",
      source: STOREFRONT_ASSISTANT_SOURCE,
      timestamp: now,
    }),
  );
  batch.set(
    assistantMessageRef,
    firestoreData({
      conversationId: conversationRef.id,
      parts: textPart(response.answer),
      role: "assistant",
      source: STOREFRONT_ASSISTANT_SOURCE,
      storefrontAssistant: {
        contact: response.contact,
        products: response.products,
        refusal: response.refusal,
        topic: response.topic,
      },
      timestamp: now,
    }),
  );

  await batch.commit();

  return conversationRef.id;
}
