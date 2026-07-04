import { AssistantConversation, AssistantMessage } from "@konfi/types";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";

/**
 * Removes `undefined` values so Firestore doesn’t reject the write.
 */
const stripUndefined = <T extends Record<string, unknown>>(
  obj: T,
): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;

/**
 * Creates a new assistant conversation
 */
export async function createAssistantConversation(
  firestore: Firestore,
  conversation: Omit<AssistantConversation, "id">,
): Promise<string> {
  try {
    const conversationRef = await addDoc(
      collection(firestore, "assistantConversations"),
      {
        ...conversation,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    return conversationRef.id;
  } catch (error) {
    return Promise.reject(
      `Failed to create assistant conversation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Gets all assistant conversations for a user
 */
export async function getAssistantConversations(
  firestore: Firestore,
  userId: string,
  channelId?: string,
  limitCount?: number,
): Promise<AssistantConversation[]> {
  const constraints: QueryConstraint[] = [
    where("userId", "==", userId),
    where("active", "==", true),
    orderBy("lastMessageAt", "desc"),
  ];

  if (channelId) {
    constraints.push(where("channelId", "==", channelId));
  }

  if (limitCount) {
    constraints.push(limit(limitCount));
  }

  const q = query(
    collection(firestore, "assistantConversations"),
    ...constraints,
  );
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as AssistantConversation[];
}

/**
 * Gets a specific assistant conversation
 */
export async function getAssistantConversation(
  firestore: Firestore,
  conversationId: string,
  userId: string,
): Promise<AssistantConversation | null> {
  const conversationRef = doc(
    firestore,
    "assistantConversations",
    conversationId,
  );
  const conversationDoc = await getDoc(conversationRef);

  if (!conversationDoc.exists()) {
    return null;
  }

  const conversation = conversationDoc.data() as AssistantConversation;

  // Verify user owns this conversation
  if (conversation.userId !== userId) {
    return null;
  }

  return {
    ...conversation,
    id: conversationDoc.id,
  };
}

/**
 * Updates an assistant conversation
 */
export async function updateAssistantConversation(
  firestore: Firestore,
  conversationId: string,
  updates: Partial<AssistantConversation>,
  userId: string,
): Promise<void> {
  const conversationRef = doc(
    firestore,
    "assistantConversations",
    conversationId,
  );

  const conversation = await getAssistantConversation(
    firestore,
    conversationId,
    userId,
  );
  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  await updateDoc(conversationRef, {
    ...stripUndefined(updates),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes an assistant conversation
 */
export async function deleteAssistantConversation(
  firestore: Firestore,
  conversationId: string,
  userId: string,
): Promise<void> {
  const conversationRef = doc(
    firestore,
    "assistantConversations",
    conversationId,
  );

  // First verify the user owns this conversation
  const conversation = await getAssistantConversation(
    firestore,
    conversationId,
    userId,
  );
  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  // Mark as inactive instead of deleting to preserve message history
  await updateDoc(conversationRef, {
    active: false,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Adds a message to an assistant conversation
 */
export async function addAssistantMessage(
  firestore: Firestore,
  conversationId: string,
  message: Omit<AssistantMessage, "id" | "conversationId">,
): Promise<string> {
  const data = stripUndefined({
    ...message,
    conversationId,
    timestamp: message.timestamp ?? serverTimestamp(),
  });

  const messageRef = await addDoc(
    collection(firestore, "assistantConversations", conversationId, "messages"),
    data,
  );

  // Update conversation's last message timestamp and message count
  const conversationRef = doc(
    firestore,
    "assistantConversations",
    conversationId,
  );

  await updateDoc(conversationRef, {
    lastMessageAt: serverTimestamp(),
    messageCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  return messageRef.id;
}

/**
 * Gets messages from an assistant conversation
 */
export async function getAssistantMessages(
  firestore: Firestore,
  conversationId: string,
  limitCount?: number,
  before?: Timestamp,
): Promise<AssistantMessage[]> {
  const constraints: QueryConstraint[] = [orderBy("timestamp", "desc")];

  if (before) {
    constraints.push(where("timestamp", "<", before));
  }

  if (limitCount) {
    constraints.push(limit(limitCount));
  }

  const q = query(
    collection(firestore, "assistantConversations", conversationId, "messages"),
    ...constraints,
  );
  const querySnapshot = await getDocs(q);

  const messages = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as AssistantMessage[];

  // Return messages in chronological order (oldest first)
  return messages.reverse();
}

/**
 * Updates an assistant message
 */
export async function updateAssistantMessage(
  firestore: Firestore,
  conversationId: string,
  messageId: string,
  updates: Partial<AssistantMessage>,
): Promise<void> {
  const messageRef = doc(
    firestore,
    "assistantConversations",
    conversationId,
    "messages",
    messageId,
  );

  await updateDoc(messageRef, stripUndefined(updates));
}
