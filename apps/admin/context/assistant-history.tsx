"use client";

import { useT } from "@/i18n/client";
import { sanitizeUIMessageParts } from "@/lib/ai/chat-message-sanitization";
import { firestore } from "@/lib/firebase/clientApp";
import {
  addAssistantMessage,
  createAssistantConversation,
  deleteAssistantConversation,
  getAssistantConversation,
  getAssistantConversations,
  getAssistantMessages,
  MODELS,
  resolveAssistantModelId,
  updateAssistantConversation,
  updateAssistantMessage,
} from "@konfi/firebase";
import {
  AssistantConversation,
  AssistantMessage,
  AssistantSession,
  FormattedOrderItem,
} from "@konfi/types";
import { ADMIN_TOOLS_CHAT_ID } from "@konfi/utils";
import { UIMessage } from "ai";
import { Timestamp } from "firebase/firestore";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { generateAdminText } from "@/actions/ai";
import { useAuth } from "./auth";
import { useChannels } from "./channels";

const SESSION_STORAGE_KEY = "konfi_private_chat_session";

// Helper to load session from sessionStorage
function loadSessionFromStorage(): AssistantSession | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert timestamp objects back to Firestore Timestamps
      if (parsed.messages) {
        parsed.messages = parsed.messages.map((msg: AssistantMessage) => ({
          ...msg,
          parts: sanitizeUIMessageParts(msg.parts),
          timestamp: msg.timestamp
            ? Timestamp.fromMillis(
                (msg.timestamp as { seconds: number }).seconds * 1000,
              )
            : Timestamp.now(),
        }));
      }
      parsed.modelId = resolveAssistantModelId(parsed.modelId);
      return parsed;
    }
  } catch (e) {
    console.error("Error loading session from storage:", e);
  }
  return null;
}

// Helper to save session to sessionStorage
function saveSessionToStorage(session: AssistantSession) {
  if (typeof window === "undefined") return;
  try {
    // Only save private sessions with messages
    if (session.private && session.messages.length > 0) {
      // Convert Timestamps to plain objects for JSON serialization
      const toSave = {
        ...session,
        messages: session.messages.map((msg) => ({
          ...msg,
          parts: sanitizeUIMessageParts(msg.parts),
          timestamp: {
            seconds: msg.timestamp.seconds,
            nanoseconds: msg.timestamp.nanoseconds,
          },
        })),
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
    } else if (!session.private || session.messages.length === 0) {
      // Clear storage when switching to non-private mode or clearing messages
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (e) {
    console.error("Error saving session to storage:", e);
  }
}

interface AssistantHistoryContextType {
  // Conversation management
  conversations: AssistantConversation[] | null;
  currentConversation: AssistantConversation | null;
  loadingConversations: boolean;

  // Session management
  currentSession: AssistantSession;
  isPrivateMode: boolean;
  sessionKey: number; // Increments on clearSession to force remount

  // Actions
  createConversation: (title: string) => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  saveCurrentSession: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  renameConversation: (
    conversationId: string,
    newTitle: string,
  ) => Promise<void>;
  togglePrivateMode: () => void;
  clearSession: () => void;
  updateSessionModel: (modelId: string) => void;

  // Message actions
  addMessage: (
    message: Omit<AssistantMessage, "id" | "conversationId" | "timestamp">,
  ) => Promise<void>;
  updateMessage: (
    messageId: string,
    updates: Partial<AssistantMessage>,
  ) => Promise<void>;

  // Session message management (for both private and persistent)
  addSessionMessage: (
    parts: UIMessage["parts"],
    role: UIMessage["role"],
    references?: Array<{
      url: string;
      title: string;
      content: string;
      thumbnail: string;
    }>,
    orderItems?: FormattedOrderItem[],
    thoughtSignature?: string,
  ) => Promise<void>;
  updateSessionMessage: (
    index: number,
    updates: Partial<AssistantMessage>,
  ) => void;
  getSessionMessages: () => AssistantMessage[];
  clearSessionMessages: () => void;
}

const AssistantHistoryContext = createContext<
  AssistantHistoryContextType | undefined
>(undefined);

interface AssistantHistoryProviderProps {
  children: ReactNode;
}

type PersistableAssistantMessage = Omit<
  AssistantMessage,
  "id" | "conversationId"
>;

function isTempAssistantMessage(message: Pick<AssistantMessage, "id">) {
  return message.id.startsWith("temp-");
}

function toPersistableAssistantMessage(
  message: Pick<
    AssistantMessage,
    | "parts"
    | "role"
    | "timestamp"
    | "references"
    | "orderItems"
    | "thoughtSignature"
  >,
): PersistableAssistantMessage {
  return {
    parts: message.parts,
    role: message.role,
    timestamp: message.timestamp,
    references: message.references ?? [],
    orderItems: message.orderItems ?? [],
    thoughtSignature: message.thoughtSignature,
  };
}

export function AssistantHistoryProvider({
  children,
}: AssistantHistoryProviderProps) {
  const { user } = useAuth();
  const { channel } = useChannels();
  const { t, i18n } = useT();

  const conversationTitleRef = useRef<string | null>(null);

  // State
  const [conversations, setConversations] = useState<
    AssistantConversation[] | null
  >(null);
  const [currentConversation, setCurrentConversation] =
    useState<AssistantConversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [currentSession, setCurrentSession] = useState<AssistantSession>(() => {
    // Try to restore from sessionStorage first (for private sessions)
    const stored = loadSessionFromStorage();
    if (stored) return stored;

    return {
      conversationId: undefined,
      messages: [],
      modelId: MODELS.ASSISTANT_FAST,
      private: true,
    };
  });
  const currentSessionRef = useRef(currentSession);

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  const updateCurrentSession = useCallback(
    (updater: (prev: AssistantSession) => AssistantSession) => {
      setCurrentSession((prev) => {
        const next = updater(prev);
        currentSessionRef.current = next;
        return next;
      });
    },
    [],
  );

  // Persist session to sessionStorage whenever it changes
  useEffect(() => {
    saveSessionToStorage(currentSession);
  }, [currentSession]);

  // Load conversations when user/channel changes
  useEffect(() => {
    if (user && channel) {
      loadConversations();
    }
  }, [user, channel]);

  async function loadConversations() {
    if (!user || !channel) return;

    setLoadingConversations(true);
    try {
      const conversationsData = await getAssistantConversations(
        firestore,
        user.uid,
        channel.id,
        50, // Limit to 50 most recent conversations
      );
      setConversations(conversationsData);
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setLoadingConversations(false);
    }
  }

  const createConversation = useCallback(
    async (title: string) => {
      if (!user || !channel) return;

      try {
        const conversationId = await createAssistantConversation(firestore, {
          title,
          userId: user.uid,
          channelId: channel.id,
          modelId: currentSession.modelId,
          messageCount: 0,
          lastMessageAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          active: true,
        });

        // Reload conversations to include the new one
        await loadConversations();

        // Switch to the new conversation
        await loadConversation(conversationId);
      } catch (error) {
        console.error("Error creating conversation:", error);
      }
    },
    [user, channel, currentSession.modelId, loadConversations],
  );

  const loadConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;

      try {
        const conversation = await getAssistantConversation(
          firestore,
          conversationId,
          user.uid,
        );
        if (!conversation) {
          throw new Error("Conversation not found");
        }

        setCurrentConversation(conversation);

        // Load messages for this conversation
        const messages = await getAssistantMessages(
          firestore,
          conversationId,
          100,
        );
        const sanitizedMessages = messages.map((message) => ({
          ...message,
          parts: sanitizeUIMessageParts(message.parts),
        }));

        updateCurrentSession((prev) => ({
          ...prev,
          conversationId,
          messages: sanitizedMessages,
          private: false,
          modelId: resolveAssistantModelId(conversation.modelId),
        }));
      } catch (error) {
        console.error("Error loading conversation:", error);
      }
    },
    [updateCurrentSession, user],
  );

  const isSavingSessionRef = useRef(false);

  // Recursively strip undefined values so Firestore doesn't reject nested data
  const sanitizeForFirestore = useCallback(<T,>(value: T): T => {
    if (value instanceof Timestamp) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => sanitizeForFirestore(v)) as unknown as T;
    }
    if (value && typeof value === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(value as any)) {
        if (v === undefined) continue;
        out[k] = sanitizeForFirestore(v);
      }
      return out;
    }
    return value;
  }, []);

  const persistAssistantMessage = useCallback(
    async (
      conversationId: string,
      message: PersistableAssistantMessage,
    ): Promise<string> => {
      return addAssistantMessage(
        firestore,
        conversationId,
        sanitizeForFirestore(message),
      );
    },
    [sanitizeForFirestore],
  );

  const saveCurrentSession = useCallback(async () => {
    if (isSavingSessionRef.current) return;
    isSavingSessionRef.current = true;
    try {
      const session = currentSessionRef.current;
      if (!user || !channel || session.private) return;

      let conversationId = session.conversationId;

      // Create conversation if it doesn’t exist yet
      if (!conversationId) {
        // Derive (and cache) the title exactly once when persisting the conversation.
        let title = conversationTitleRef.current;
        if (session.messages.length > 0) {
          const first = session.messages[0];
          const firstText =
            first.parts[0]?.type === "text" ? first.parts[0].text : "";
          if (firstText) {
            try {
              const generated = await generateAdminText({
                systemPrompt: t("assistant.history.generateTitlePrompt", {
                  defaultValue:
                    "Generate chat title from the first message, do not add any formatting or extra text. Just the title.",
                }),
                context: firstText,
                modelId: MODELS.GEMINI_FLASH_LATEST,
              });
              title =
                (generated || "").trim() ||
                t("assistant.history.new", {
                  defaultValue: "New Conversation",
                });
            } catch (err) {
              console.error("AI title generation failed, using fallback:", err);
              title = t("assistant.history.new", {
                defaultValue: "New Conversation",
              });
            }
          } else {
            title = t("assistant.history.new", {
              defaultValue: "New Conversation",
            });
          }
        } else {
          title = t("assistant.history.new", {
            defaultValue: "New Conversation",
          });
        }
        conversationTitleRef.current = title;

        conversationId = await createAssistantConversation(firestore, {
          title,
          userId: user.uid,
          channelId: channel.id,
          modelId: session.modelId,
          messageCount: session.messages.length,
          lastMessageAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          active: true,
        });

        history.pushState(
          {},
          "",
          "/" + i18n.resolvedLanguage + ADMIN_TOOLS_CHAT_ID(conversationId),
        );
      }

      const persistedMessageIds = new Map<string, string>();

      // Persist any unsaved messages using their original timestamps.
      for (const message of session.messages) {
        if (!isTempAssistantMessage(message)) {
          continue;
        }

        const persistedId = await persistAssistantMessage(
          conversationId,
          toPersistableAssistantMessage(message),
        );
        persistedMessageIds.set(message.id, persistedId);
      }

      // Update session with conversation ID and replace temp IDs to avoid re-saving duplicates.
      updateCurrentSession((prev) => ({
        ...prev,
        conversationId,
        private: false,
        messages: prev.messages.map((message) => {
          const persistedId = persistedMessageIds.get(message.id);

          if (persistedId) {
            return {
              ...message,
              id: persistedId,
              conversationId,
            };
          }

          if (message.conversationId) {
            return message;
          }

          return {
            ...message,
            conversationId,
          };
        }),
      }));

      // Refresh sidebar
      await loadConversations();
    } catch (err) {
      console.error("Error saving session:", err);
    } finally {
      isSavingSessionRef.current = false;
    }
  }, [
    channel,
    i18n.resolvedLanguage,
    loadConversations,
    persistAssistantMessage,
    t,
    updateCurrentSession,
    user,
  ]);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;

      try {
        await deleteAssistantConversation(firestore, conversationId, user.uid);

        // If we're currently viewing this conversation, clear it
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null);
          updateCurrentSession((prev) => ({
            ...prev,
            conversationId: undefined,
            messages: [],
            private: false,
          }));
        }

        // Reload conversations
        await loadConversations();
      } catch (error) {
        console.error("Error deleting conversation:", error);
      }
    },
    [currentConversation, loadConversations, updateCurrentSession, user],
  );

  const renameConversation = useCallback(
    async (conversationId: string, newTitle: string) => {
      if (!user) return;

      try {
        await updateAssistantConversation(
          firestore,
          conversationId,
          { title: newTitle },
          user.uid,
        );
        await loadConversations();
      } catch (error) {
        console.error("Error renaming conversation:", error);
      }
    },
    [user, currentConversation, loadConversations],
  );

  const togglePrivateMode = useCallback(() => {
    updateCurrentSession((prev) => {
      const next = {
        ...prev,
        private: !prev.private,
        // keep id only when staying public
        conversationId: prev.private ? prev.conversationId : undefined,
      };

      // If we’re leaving private mode and nothing is persisted yet,
      // trigger an immediate save so the UI keeps working.
      if (prev.private && !prev.conversationId) {
        // defer to end of event loop to ensure state is committed
        setTimeout(() => saveCurrentSession(), 0);
      }

      return next;
    });
  }, [saveCurrentSession, updateCurrentSession]);

  const clearSession = useCallback(() => {
    updateCurrentSession((prev) => ({
      ...prev,
      conversationId: undefined,
      messages: [],
    }));
    setCurrentConversation(null);
    setSessionKey((prev) => prev + 1); // Force remount of Chat component
    // Clear sessionStorage when explicitly clearing
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [updateCurrentSession]);

  const updateSessionModel = useCallback(
    (modelId: string) => {
      updateCurrentSession((prev) => ({
        ...prev,
        modelId: resolveAssistantModelId(modelId),
      }));
    },
    [updateCurrentSession],
  );

  const addMessage = useCallback(
    async (
      message: Omit<AssistantMessage, "id" | "conversationId" | "timestamp">,
    ) => {
      if (!currentSession.conversationId || currentSession.private) return;

      try {
        await addAssistantMessage(firestore, currentSession.conversationId, {
          ...message,
          timestamp: Timestamp.now(),
        });
      } catch (error) {
        console.error("Error adding message:", error);
      }
    },
    [currentSession.conversationId, currentSession.private],
  );

  const updateMessage = useCallback(
    async (messageId: string, updates: Partial<AssistantMessage>) => {
      if (!currentSession.conversationId || currentSession.private) return;

      try {
        await updateAssistantMessage(
          firestore,
          currentSession.conversationId,
          messageId,
          updates,
        );
      } catch (error) {
        console.error("Error updating message:", error);
      }
    },
    [currentSession.conversationId, currentSession.private],
  );

  // Session message management
  const addSessionMessage = useCallback(
    async (
      parts: UIMessage["parts"],
      role: UIMessage["role"],
      references?: Array<{
        url: string;
        title: string;
        content: string;
        thumbnail: string;
      }>,
      orderItems?: FormattedOrderItem[],
      thoughtSignature?: string,
    ) => {
      const sanitizedParts = sanitizeUIMessageParts(parts);
      const message: AssistantMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        conversationId: currentSessionRef.current.conversationId || "",
        parts: sanitizedParts,
        role,
        timestamp: Timestamp.now(),
        references: references ?? [],
        orderItems: orderItems ?? [],
        thoughtSignature,
      };

      const tempId = message.id;

      updateCurrentSession((prev) => {
        const newMessages = [...prev.messages, message];
        return { ...prev, messages: newMessages };
      });

      // Persist directly if conversation already exists
      const conversationId = currentSessionRef.current.conversationId;

      if (!currentSessionRef.current.private && conversationId) {
        try {
          const persistedId = await persistAssistantMessage(
            conversationId,
            toPersistableAssistantMessage(message),
          );

          if (currentSessionRef.current.messages.length === 2) {
            renameConversation(
              conversationId,
              await generateAdminText({
                systemPrompt: t("assistant.history.generateTitlePrompt", {
                  defaultValue:
                    "Generate chat title from the first message, do not add any formatting or extra text. Just the title.",
                }),
                context: JSON.stringify(
                  currentSessionRef.current.messages.map((m) => m.parts),
                ),
                modelId: MODELS.GEMINI_FLASH_LATEST,
              }),
            );
          }

          // Replace temp id with real id to avoid double save later
          updateCurrentSession((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === tempId
                ? ({
                    ...m,
                    id: persistedId,
                    conversationId,
                    references: m.references ?? [],
                    orderItems: m.orderItems ?? [],
                  } as AssistantMessage)
                : m,
            ) as AssistantMessage[],
          }));
        } catch (err) {
          console.error("Error persisting message:", err);
        }
      }
    },
    [persistAssistantMessage, renameConversation, t, updateCurrentSession],
  );

  const updateSessionMessage = useCallback(
    (index: number, updates: Partial<AssistantMessage>) => {
      updateCurrentSession((prev) => ({
        ...prev,
        messages: prev.messages.map((msg, i) =>
          i === index ? { ...msg, ...updates } : msg,
        ),
      }));
    },
    [updateCurrentSession],
  );

  const getSessionMessages = useCallback(() => {
    return currentSession.messages;
  }, [currentSession.messages]);

  const clearSessionMessages = useCallback(() => {
    updateCurrentSession((prev) => ({
      ...prev,
      messages: [],
    }));
  }, [updateCurrentSession]);

  const value: AssistantHistoryContextType = {
    conversations,
    currentConversation,
    loadingConversations,
    currentSession,
    isPrivateMode: currentSession.private,
    sessionKey,
    createConversation,
    loadConversation,
    saveCurrentSession,
    deleteConversation,
    renameConversation,
    togglePrivateMode,
    clearSession,
    updateSessionModel,
    addMessage,
    updateMessage,
    addSessionMessage,
    updateSessionMessage,
    getSessionMessages,
    clearSessionMessages,
  };

  return (
    <AssistantHistoryContext.Provider value={value}>
      {children}
    </AssistantHistoryContext.Provider>
  );
}

export function useAssistantHistory() {
  const context = useContext(AssistantHistoryContext);
  if (context === undefined) {
    throw new Error(
      "useAssistantHistory must be used within an AssistantHistoryProvider",
    );
  }
  return context;
}
