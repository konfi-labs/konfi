"use client";

import { firestore } from "@/lib/firebase/clientApp";
import type { NestedMember } from "@konfi/types";
import { db } from "@konfi/firebase";
import { UIMessage } from "ai";
import { onSnapshot } from "firebase/firestore";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import type {
  AgentFileMetadata,
  AgentTaskType,
  QuoteAgentData,
} from "@/lib/ai/durable-agents/types";
import type {
  ProductAgentBlockedItem,
  ProductAgentCatalogChange,
  ProductAgentCatalogSetupPlan,
  ProductAgentDraft,
} from "@/lib/ai/durable-agents/product-workflow.types";
import { getLatestPendingAgentHook } from "@/lib/ai/durable-agents/pending-hooks";
import { useChannels } from "./channels";
import { useConfigurationCatalog } from "./configuration";

export type AgentStatus =
  | "pending"
  | "processing"
  | "awaiting-approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

export type AgentRunTaskType =
  | AgentTaskType
  | "businessUpdate"
  | "category"
  | "productType";

export interface CategoryAgentDraftSummary {
  blockedItems?: unknown[];
  category: {
    description?: string;
    name: string;
    seo?: {
      description?: string;
      slug?: string;
      title?: string;
    };
  };
  readyForCreate?: boolean;
  reviewSummary?: string;
}

export interface ProductTypeAgentDraftSummary {
  blockedItems?: unknown[];
  productType: {
    attributes: string[];
    id: string;
    isShippable: boolean;
    name: string;
  };
  readyForCreate?: boolean;
  reviewSummary?: string;
}

export interface AgentMessage {
  role: UIMessage["role"];
  content: string | AgentMessagePart[];
}

export interface AgentMessagePart {
  type: "text" | "tool-call" | "tool-result";
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export type AgentRunFeedbackValue = "positive" | "negative";

export interface AgentRunFeedback {
  value: AgentRunFeedbackValue;
  updatedAt?: Date;
  updatedBy?: {
    email?: string;
    id: string;
    name?: string;
  };
}

export interface AgentRun {
  id: string;
  runId: string;
  taskType: AgentRunTaskType;
  status: AgentStatus;
  prompt: string;
  createdAt: Date;
  progress?: number;
  estimatedTimeLeft?: number;
  currentStep?: string;
  result?: {
    customer?: string;
    itemCount?: number;
    totalPrice?: number;
    productDraft?: ProductAgentDraft;
    blockedItems?: ProductAgentBlockedItem[];
    catalogChanges?: ProductAgentCatalogChange[];
    catalogChangesVersion?: 1;
    categoryDraft?: CategoryAgentDraftSummary;
    productTypeDraft?: ProductTypeAgentDraftSummary;
    readyForCreate?: boolean;
    collectedData?: QuoteAgentData & {
      catalogChanges?: ProductAgentCatalogChange[];
      catalogChangesVersion?: 1;
      categoryDraft?: CategoryAgentDraftSummary;
      productTypeDraft?: ProductTypeAgentDraftSummary;
      catalogSetupPlan?: ProductAgentCatalogSetupPlan | null;
      draft?:
        | ProductAgentDraft
        | CategoryAgentDraftSummary
        | ProductTypeAgentDraftSummary;
      blockedItems?: ProductAgentBlockedItem[];
      pricePreview?: string;
      readyForCreate?: boolean;
      totalPrice?: number;
    };
  };
  messages?: AgentMessage[];
  stepsCount?: number;
  error?: string;
  fileMetadata?: AgentFileMetadata[];
  feedback?: AgentRunFeedback;
}

interface AgentFirestoreDoc {
  runId?: string;
  taskType?: AgentRunTaskType;
  status?: AgentStatus;
  prompt?: string;
  createdAt?: unknown;
  result?: AgentRun["result"];
  messages?: AgentMessage[];
  hasPendingHook?: boolean;
  pendingHookToken?: string;
  stepsCount?: number;
  error?: string | { message?: string };
  fileMetadata?: AgentFileMetadata[];
  feedback?: unknown;
}

function toAgentDate(value: unknown, fallback: Date): Date {
  if (value && typeof value === "object" && "toDate" in value) {
    const ts = value as { toDate?: () => Date };
    if (typeof ts.toDate === "function") {
      return ts.toDate();
    }
  }

  if (value && typeof value === "object" && "_seconds" in value) {
    const seconds = (value as { _seconds?: unknown })["_seconds"];
    if (typeof seconds === "number") {
      return new Date(seconds * 1000);
    }
  }

  if (typeof value === "string" || value instanceof Date) {
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return fallback;
}

function normalizeAgentError(
  value: AgentFirestoreDoc["error"],
): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && typeof value.message === "string") {
    return value.message;
  }

  return undefined;
}

function normalizeAgentResult(
  result: AgentFirestoreDoc["result"] | undefined,
): AgentRun["result"] | undefined {
  if (!result?.collectedData) {
    return result;
  }

  return {
    customer:
      typeof result.collectedData.customer === "object"
        ? result.collectedData.customer?.name
        : result.collectedData.customer,
    itemCount: result.collectedData.items?.length,
    productDraft: result.collectedData.draft as ProductAgentDraft | undefined,
    blockedItems: result.collectedData.blockedItems,
    catalogChanges: result.collectedData.catalogChanges,
    catalogChangesVersion: result.collectedData.catalogChangesVersion,
    categoryDraft: result.collectedData.categoryDraft,
    productTypeDraft: result.collectedData.productTypeDraft,
    readyForCreate: result.collectedData.readyForCreate,
    totalPrice: result.collectedData.totalPrice,
    collectedData: result.collectedData,
  };
}

function normalizeAgentFeedback(value: unknown): AgentRunFeedback | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const rawFeedback = value as {
    updatedAt?: unknown;
    updatedBy?: unknown;
    value?: unknown;
  };

  if (rawFeedback.value !== "positive" && rawFeedback.value !== "negative") {
    return undefined;
  }

  const updatedBy =
    rawFeedback.updatedBy && typeof rawFeedback.updatedBy === "object"
      ? (rawFeedback.updatedBy as {
          email?: unknown;
          id?: unknown;
          name?: unknown;
        })
      : undefined;

  return {
    value: rawFeedback.value,
    updatedAt: toAgentDate(rawFeedback.updatedAt, new Date()),
    updatedBy:
      typeof updatedBy?.id === "string"
        ? {
            id: updatedBy.id,
            ...(typeof updatedBy.email === "string"
              ? { email: updatedBy.email }
              : {}),
            ...(typeof updatedBy.name === "string"
              ? { name: updatedBy.name }
              : {}),
          }
        : undefined,
  };
}

function sortAgentsByCreatedAtDesc(runs: AgentRun[]): AgentRun[] {
  return [...runs].toSorted(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}

function mergeAgentRun(options: {
  incoming: AgentRun;
  previous: AgentRun[];
}): AgentRun[] {
  const { incoming, previous } = options;
  const existingAgent = previous.find(
    (agent) => agent.runId === incoming.runId,
  );
  const nextAgent = existingAgent
    ? {
        ...existingAgent,
        ...incoming,
        id: existingAgent.id,
        createdAt: incoming.createdAt ?? existingAgent.createdAt,
      }
    : incoming;

  const otherAgents = previous.filter(
    (agent) => agent.runId !== incoming.runId,
  );

  return sortAgentsByCreatedAtDesc([nextAgent, ...otherAgents]);
}

function mapAgentDocToRun(options: {
  data: AgentFirestoreDoc;
  existing?: AgentRun;
  runId: string;
}): AgentRun {
  const { data, existing, runId } = options;
  const fallbackCreatedAt = existing?.createdAt ?? new Date();
  const status = data.status ?? existing?.status ?? "processing";
  const hasPendingHook =
    data.hasPendingHook === true ||
    (typeof data.pendingHookToken === "string" &&
      data.pendingHookToken.length > 0) ||
    Boolean(getLatestPendingAgentHook(data.messages ?? existing?.messages));
  const normalizedStatus =
    status === "awaiting-approval" && !hasPendingHook ? "processing" : status;

  return {
    id: existing?.id ?? `agent-${runId}`,
    runId,
    taskType: data.taskType ?? existing?.taskType ?? "quote",
    status: normalizedStatus,
    prompt: data.prompt ?? existing?.prompt ?? "",
    createdAt: toAgentDate(data.createdAt, fallbackCreatedAt),
    result: normalizeAgentResult(data.result) ?? existing?.result,
    messages: data.messages ?? existing?.messages,
    stepsCount: data.stepsCount ?? existing?.stepsCount,
    error: normalizeAgentError(data.error) ?? existing?.error,
    fileMetadata: data.fileMetadata ?? existing?.fileMetadata,
    feedback: normalizeAgentFeedback(data.feedback) ?? existing?.feedback,
  };
}

interface StartAgentParams {
  taskType: AgentTaskType;
  prompt: string;
  fileMetadata?: AgentFileMetadata[];
  createdBy?: NestedMember;
  previousRunId?: string; // For retrying with additional context
  additionalInput?: string; // Additional user input for retry
}

interface AgentsContextValue {
  agents: AgentRun[];
  isStarting: boolean;
  isLoading: boolean;
  startAgent: (params: StartAgentParams) => Promise<string | null>;
  retryAgent: (
    runId: string,
    additionalInput: string,
  ) => Promise<string | null>;
  respondToAgent: (
    runId: string,
    response: string,
    options?: {
      approved?: boolean;
      catalogSetupPlan?: ProductAgentCatalogSetupPlan;
      confirmed?: boolean;
    },
  ) => Promise<boolean>;
  addAgent: (agent: Omit<AgentRun, "id" | "createdAt">) => void;
  approveAgent: (runId: string, comment?: string) => Promise<boolean>;
  rejectAgent: (runId: string, comment?: string) => Promise<boolean>;
  cancelAgent: (runId: string) => void;
  removeAgent: (runId: string) => void;
  setAgentFeedback: (
    runId: string,
    value: AgentRunFeedbackValue | null,
  ) => Promise<boolean>;
  updateAgentStatus: (
    runId: string,
    status: AgentStatus,
    data?: Partial<AgentRun>,
  ) => void;
  refreshAgents: () => Promise<void>;
}

const AgentsContext = createContext<AgentsContextValue | null>(null);

export function useAgents() {
  const context = useContext(AgentsContext);
  if (!context) {
    throw new Error("useAgents must be used within an AgentsProvider");
  }
  return context;
}

interface AgentsProviderProps {
  children: ReactNode;
}

export function AgentsProvider({ children }: AgentsProviderProps) {
  const [agents, setAgents] = useState<AgentRun[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { channel } = useChannels();
  const { attributes } = useConfigurationCatalog();
  const realtimeSubscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const loadedRef = useRef(false);
  const agentsRef = useRef<AgentRun[]>([]);

  // Keep agentsRef in sync with agents state
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  // Load existing agents from server on mount
  const loadAgentsFromServer = useCallback(async () => {
    const idToken = await getIdToken();
    if (!idToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/agents/list", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        console.error("[AgentsProvider] Failed to load agents");
        return;
      }

      const data = await response.json();
      const runs = data.runs as Array<{
        runId: string;
        taskType: AgentRunTaskType;
        status: AgentStatus;
        prompt: string;
        createdAt: string;
        hasPendingHook?: boolean;
        result?: {
          customer?: string;
          itemCount?: number;
          totalPrice?: number;
          productDraft?: ProductAgentDraft;
          blockedItems?: ProductAgentBlockedItem[];
          categoryDraft?: CategoryAgentDraftSummary;
          productTypeDraft?: ProductTypeAgentDraftSummary;
          readyForCreate?: boolean;
          collectedData?: QuoteAgentData & {
            categoryDraft?: CategoryAgentDraftSummary;
            productTypeDraft?: ProductTypeAgentDraftSummary;
            catalogSetupPlan?: ProductAgentCatalogSetupPlan | null;
            draft?:
              | ProductAgentDraft
              | CategoryAgentDraftSummary
              | ProductTypeAgentDraftSummary;
            blockedItems?: ProductAgentBlockedItem[];
            pricePreview?: string;
            readyForCreate?: boolean;
            totalPrice?: number;
          };
        };
        messages?: AgentMessage[];
        stepsCount?: number;
        error?: string;
        fileMetadata?: AgentFileMetadata[];
        feedback?: AgentRunFeedback;
      }>;

      if (runs && runs.length > 0) {
        const serverAgents = runs.map((run) =>
          mapAgentDocToRun({
            data: {
              error: run.error,
              fileMetadata: run.fileMetadata,
              feedback: run.feedback,
              hasPendingHook: run.hasPendingHook,
              messages: run.messages,
              prompt: run.prompt,
              result: run.result,
              runId: run.runId,
              status: run.status,
              stepsCount: run.stepsCount,
              taskType: run.taskType,
              createdAt: run.createdAt,
            },
            runId: run.runId,
          }),
        );

        // Merge with existing local agents - server data takes precedence
        setAgents((prev) => {
          const serverRunIds = new Set(serverAgents.map((a) => a.runId));
          // Keep local agents that aren't on server yet
          const localOnlyAgents = prev.filter(
            (a) => !serverRunIds.has(a.runId),
          );
          return sortAgentsByCreatedAtDesc([
            ...localOnlyAgents,
            ...serverAgents,
          ]);
        });
      }
    } catch (error) {
      console.error("[AgentsProvider] Error loading agents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken]);

  // Load agents on mount when user is available
  useEffect(() => {
    if (user && !loadedRef.current) {
      loadedRef.current = true;
      loadAgentsFromServer();
    }
  }, [user, loadAgentsFromServer]);

  // Expose refresh function
  const refreshAgents = useCallback(async () => {
    await loadAgentsFromServer();
  }, [loadAgentsFromServer]);

  useEffect(() => {
    for (const [
      runId,
      unsubscribe,
    ] of realtimeSubscriptionsRef.current.entries()) {
      if (!agents.some((agent) => agent.runId === runId)) {
        unsubscribe();
        realtimeSubscriptionsRef.current.delete(runId);
      }
    }

    for (const agent of agents) {
      if (realtimeSubscriptionsRef.current.has(agent.runId)) {
        continue;
      }

      const agentDocRef = db.doc<AgentFirestoreDoc>(
        firestore,
        "/agents",
        agent.runId,
      );

      const unsubscribe = onSnapshot(
        agentDocRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            return;
          }

          const nextAgent = mapAgentDocToRun({
            data: snapshot.data(),
            existing: agentsRef.current.find(
              (currentAgent) => currentAgent.runId === agent.runId,
            ),
            runId: agent.runId,
          });

          setAgents((previous) =>
            mergeAgentRun({ incoming: nextAgent, previous }),
          );
        },
        (error) => {
          console.error(
            "[AgentsProvider] Firestore subscription error:",
            error,
          );
        },
      );

      realtimeSubscriptionsRef.current.set(agent.runId, unsubscribe);
    }

    return () => undefined;
  }, [agents]);

  useEffect(
    () => () => {
      for (const unsubscribe of realtimeSubscriptionsRef.current.values()) {
        unsubscribe();
      }
      realtimeSubscriptionsRef.current.clear();
    },
    [],
  );

  const startAgent = useCallback(
    async ({
      taskType,
      prompt,
      fileMetadata,
      createdBy,
    }: StartAgentParams): Promise<string | null> => {
      const idToken = await getIdToken();
      const channelId = channel?.id;

      if (!idToken || !channelId) {
        console.error("[AgentsProvider] Missing idToken or channelId");
        return null;
      }

      const member: NestedMember = createdBy ?? {
        id: user?.uid ?? "",
        name: user?.displayName ?? user?.email ?? "Unknown",
      };

      setIsStarting(true);

      try {
        const response = await fetch("/api/agents/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            taskType,
            prompt,
            channelId,
            createdBy: member,
            attributes: attributes ?? [],
            fileMetadata,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error ?? "Failed to start agent");
        }

        const data = await response.json();
        const runId = data.runId;

        // Add the new agent to the list
        const newAgent: AgentRun = {
          id: `agent-${Date.now()}`,
          runId,
          taskType,
          status: "processing",
          prompt,
          createdAt: new Date(),
          fileMetadata,
          feedback: undefined,
          progress: 0,
        };

        setAgents((prev) => [newAgent, ...prev]);

        return runId;
      } catch (error) {
        console.error("[AgentsProvider] Error starting agent:", error);
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [getIdToken, channel, user, attributes],
  );

  const retryAgent = useCallback(
    async (runId: string, additionalInput: string): Promise<string | null> => {
      const idToken = await getIdToken();
      const channelId = channel?.id;

      if (!idToken || !channelId) {
        console.error("[AgentsProvider] Missing idToken or channelId");
        return null;
      }

      // Find the original agent to get its details
      const originalAgent = agents.find((a) => a.runId === runId);
      if (!originalAgent) {
        console.error("[AgentsProvider] Original agent not found");
        return null;
      }

      const member: NestedMember = {
        id: user?.uid ?? "",
        name: user?.displayName ?? user?.email ?? "Unknown",
      };

      // Build the new prompt with original + additional input + messages context
      const contextFromMessages =
        originalAgent.messages
          ?.filter(
            (m) => m.role === "assistant" && typeof m.content === "string",
          )
          .map((m) => m.content)
          .slice(-2) // Last 2 assistant messages for context
          .join("\n") || "";

      const enhancedPrompt = `Original request: ${originalAgent.prompt}

Previous context: ${contextFromMessages || "None"}

Additional information from user: ${additionalInput}

Please continue the task with this new information.`;

      setIsStarting(true);

      try {
        const response = await fetch("/api/agents/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            taskType: originalAgent.taskType,
            prompt: enhancedPrompt,
            channelId,
            createdBy: member,
            attributes: attributes ?? [],
            fileMetadata: originalAgent.fileMetadata,
            previousRunId: runId,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error ?? "Failed to retry agent");
        }

        const data = await response.json();
        const newRunId = data.runId;

        // Add the new agent to the list
        const newAgent: AgentRun = {
          id: `agent-${Date.now()}`,
          runId: newRunId,
          taskType: originalAgent.taskType,
          status: "processing",
          prompt: enhancedPrompt,
          createdAt: new Date(),
          fileMetadata: originalAgent.fileMetadata,
          feedback: undefined,
          progress: 0,
        };

        // Remove old agent and add new one
        setAgents((prev) => [
          newAgent,
          ...prev.filter((a) => a.runId !== runId),
        ]);

        return newRunId;
      } catch (error) {
        console.error("[AgentsProvider] Error retrying agent:", error);
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [getIdToken, channel, user, attributes, agents],
  );

  const approveAgent = useCallback(
    async (runId: string, comment?: string): Promise<boolean> => {
      const idToken = await getIdToken();
      if (!idToken) return false;

      try {
        const response = await fetch("/api/agents/approve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            runId,
            approved: true,
            comment,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error ?? "Failed to approve agent");
        }

        // Approval resumes the workflow; it's not necessarily completed yet.
        setAgents((prev) =>
          prev.map((agent) =>
            agent.runId === runId
              ? { ...agent, status: "processing" as AgentStatus }
              : agent,
          ),
        );

        return true;
      } catch (error) {
        console.error("[AgentsProvider] Error approving agent:", error);
        return false;
      }
    },
    [getIdToken],
  );

  const rejectAgent = useCallback(
    async (runId: string, comment?: string): Promise<boolean> => {
      const idToken = await getIdToken();
      if (!idToken) return false;

      try {
        const response = await fetch("/api/agents/approve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            runId,
            approved: false,
            comment,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error ?? "Failed to reject agent");
        }

        // Rejection also resumes the workflow (it may finish with a rejection message).
        setAgents((prev) =>
          prev.map((agent) =>
            agent.runId === runId
              ? { ...agent, status: "processing" as AgentStatus }
              : agent,
          ),
        );

        return true;
      } catch (error) {
        console.error("[AgentsProvider] Error rejecting agent:", error);
        return false;
      }
    },
    [getIdToken],
  );

  const respondToAgent = useCallback(
    async (
      runId: string,
      userResponse: string,
      options?: {
        approved?: boolean;
        catalogSetupPlan?: ProductAgentCatalogSetupPlan;
        confirmed?: boolean;
      },
    ): Promise<boolean> => {
      const idToken = await getIdToken();
      if (!idToken) return false;

      try {
        const currentAgent = agents.find((agent) => agent.runId === runId);

        if (currentAgent?.status !== "awaiting-approval") {
          console.warn(
            `[AgentsProvider] Ignoring response for run ${runId} because status is ${currentAgent?.status ?? "unknown"}`,
          );
          return false;
        }

        const hookToken = getLatestPendingAgentHook(
          currentAgent?.messages,
        )?.toolCallId;

        const response = await fetch("/api/agents/respond", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            ...(options?.approved !== undefined
              ? { approved: options.approved }
              : {}),
            ...(options?.catalogSetupPlan
              ? { catalogSetupPlan: options.catalogSetupPlan }
              : {}),
            ...(options?.confirmed !== undefined
              ? { confirmed: options.confirmed }
              : {}),
            runId,
            response: userResponse,
            toolCallId: hookToken ?? undefined,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error ?? "Failed to respond to agent");
        }

        // Add user message to local state
        setAgents((prev) =>
          prev.map((agent) =>
            agent.runId === runId
              ? {
                  ...agent,
                  status: "processing" as AgentStatus,
                  messages: [
                    ...(agent.messages || []),
                    { role: "user" as const, content: userResponse },
                  ],
                }
              : agent,
          ),
        );

        return true;
      } catch (error) {
        console.error("[AgentsProvider] Error responding to agent:", error);
        return false;
      }
    },
    [agents, getIdToken],
  );

  const cancelAgent = useCallback(
    (runId: string) => {
      void (async () => {
        const idToken = await getIdToken();
        if (!idToken) {
          return;
        }

        try {
          const response = await fetch("/api/agents/cancel", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ runId }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error ?? "Failed to cancel agent");
          }

          setAgents((prev) =>
            prev.map((agent) =>
              agent.runId === runId
                ? {
                    ...agent,
                    status: "failed" as AgentStatus,
                    error: "Cancelled by user",
                  }
                : agent,
            ),
          );
        } catch (error) {
          console.error("[AgentsProvider] Error cancelling agent:", error);
        }
      })();
    },
    [getIdToken],
  );

  const removeAgent = useCallback(
    (runId: string) => {
      void (async () => {
        const idToken = await getIdToken();
        if (!idToken) return;

        try {
          const response = await fetch("/api/agents/remove", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ runId }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error ?? "Failed to remove agent");
          }

          setAgents((prev) => prev.filter((agent) => agent.runId !== runId));
        } catch (error) {
          console.error("[AgentsProvider] Error removing agent:", error);
        }
      })();
    },
    [getIdToken],
  );

  const setAgentFeedback = useCallback(
    async (
      runId: string,
      value: AgentRunFeedbackValue | null,
    ): Promise<boolean> => {
      const idToken = await getIdToken();
      if (!idToken) return false;

      const previousFeedback = agentsRef.current.find(
        (agent) => agent.runId === runId,
      )?.feedback;
      const userFeedback =
        value === null
          ? undefined
          : {
              value,
              updatedAt: new Date(),
              updatedBy: {
                id: user?.uid ?? "",
                ...(user?.email ? { email: user.email } : {}),
                ...(user?.displayName ? { name: user.displayName } : {}),
              },
            };

      setAgents((prev) =>
        prev.map((agent) =>
          agent.runId === runId ? { ...agent, feedback: userFeedback } : agent,
        ),
      );

      try {
        const response = await fetch("/api/agents/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ runId, value }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error ?? "Failed to save agent feedback");
        }

        return true;
      } catch (error) {
        console.error("[AgentsProvider] Error saving agent feedback:", error);
        setAgents((prev) =>
          prev.map((agent) =>
            agent.runId === runId
              ? { ...agent, feedback: previousFeedback }
              : agent,
          ),
        );
        return false;
      }
    },
    [getIdToken, user],
  );

  const addAgent = useCallback((agent: Omit<AgentRun, "id" | "createdAt">) => {
    // Check if agent with this runId already exists
    setAgents((prev) => {
      if (prev.some((a) => a.runId === agent.runId)) {
        return prev;
      }
      const newAgent: AgentRun = {
        ...agent,
        id: `agent-${Date.now()}`,
        createdAt: new Date(),
      };
      return [newAgent, ...prev];
    });
  }, []);

  const updateAgentStatus = useCallback(
    (runId: string, status: AgentStatus, data?: Partial<AgentRun>) => {
      setAgents((prev) =>
        prev.map((agent) =>
          agent.runId === runId ? { ...agent, status, ...data } : agent,
        ),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({
      agents,
      isStarting,
      isLoading,
      startAgent,
      retryAgent,
      respondToAgent,
      addAgent,
      approveAgent,
      rejectAgent,
      cancelAgent,
      removeAgent,
      setAgentFeedback,
      updateAgentStatus,
      refreshAgents,
    }),
    [
      agents,
      isStarting,
      isLoading,
      startAgent,
      retryAgent,
      respondToAgent,
      addAgent,
      approveAgent,
      rejectAgent,
      cancelAgent,
      removeAgent,
      setAgentFeedback,
      updateAgentStatus,
      refreshAgents,
    ],
  );

  return (
    <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>
  );
}
