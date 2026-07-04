import {
  AgentRun,
  type AgentRunFeedbackValue,
  type CategoryAgentDraftSummary,
  type ProductTypeAgentDraftSummary,
} from "@/context/agents";
import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import type { ApplyProductAgentCatalogSetupResponse } from "@/actions/product-agent";
import type {
  ProductAgentCatalogChange,
  ProductAgentCatalogSetupPlan,
  ProductAgentDraft,
} from "@/lib/ai/durable-agents/product-workflow.types";
import type { UIMessageChunk } from "ai";
import {
  Badge,
  Box,
  Button,
  Card,
  Collapsible,
  Dialog,
  Flex,
  Grid,
  HStack,
  IconButton,
  Portal,
  Presence,
  Progress,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol } from "@konfi/components";
import { themeGradients } from "@konfi/components/theme";
import { CurrencyEnum } from "@konfi/types";
import {
  ADMIN_CATALOG,
  ADMIN_CATALOG_PRODUCTS_CREATE,
  ADMIN_CONFIG_PRODUCT_TYPES,
  formatPrice,
} from "@konfi/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import AgentInteractionPanel from "./AgentInteractionPanel";
import ProductCatalogSetupEditor from "./ProductCatalogSetupEditor";
import ProductDraftPricePreview from "./ProductDraftPricePreview";
import TaskMessages from "./TaskMessages";
import {
  formatRelativeTime,
  formatTimeLeft,
  getPendingInteraction,
  getLastAssistantMessage,
  getLatestPendingHook,
  isCatalogSetupPendingHook,
  statusColorMap,
} from "./taskHelpers";

interface TaskCardProps {
  agent: AgentRun;
  locale: string;
  manualRunsEnabled: boolean;
  retryInputOpen: boolean;
  retryInputText: string;
  responseInputOpen: boolean;
  responseInputText: string;
  isStarting: boolean;
  isResponding: boolean;
  onRetryToggle: (runId: string) => void;
  onRetryInputChange: (value: string) => void;
  onRetrySubmit: (runId: string) => void;
  onResponseToggle: (runId: string) => void;
  onResponseInputChange: (value: string) => void;
  onResponseSubmit: (
    runId: string,
    options?: {
      approved?: boolean;
      catalogSetupPlan?: ProductAgentCatalogSetupPlan;
      confirmed?: boolean;
      response?: string;
    },
  ) => void;
  onApplyCatalogSetup: (
    runId: string,
    catalogSetupPlan: ProductAgentCatalogSetupPlan,
  ) => Promise<ApplyProductAgentCatalogSetupResponse>;
  onApprove: (runId: string) => void;
  onReject: (runId: string) => void;
  onCancel: (runId: string) => void;
  onFeedback: (
    runId: string,
    value: AgentRunFeedbackValue | null,
  ) => Promise<boolean>;
  onRemove: (runId: string) => void;
}

interface AgentLiveState {
  currentToolCall: string | null;
  liveStepCount: number;
  isStreaming: boolean;
}

const INITIAL_AGENT_LIVE_STATE: AgentLiveState = {
  currentToolCall: null,
  liveStepCount: 0,
  isStreaming: false,
};

const AGENT_WORK_GRID_SIZE = 5;
const AGENT_WORK_CANVAS_SIZE = 41;
const INITIAL_AGENT_WORK_ROW_TARGETS = [3, 2, 4, 3, 2] as const;

const AGENT_WORK_PIXELS = Array.from({ length: 25 }, (_, index) => {
  const column = index % AGENT_WORK_GRID_SIZE;
  const row = Math.floor(index / AGENT_WORK_GRID_SIZE);

  return {
    column,
    id: `agent-work-pixel-${index}`,
    row,
  };
});

interface AgentWorkFrame {
  activeRowIndex: number;
  activeRowPixelCount: number;
  rowTargets: readonly number[];
}

const INITIAL_AGENT_WORK_FRAME: AgentWorkFrame = {
  activeRowIndex: 3,
  activeRowPixelCount: 0,
  rowTargets: INITIAL_AGENT_WORK_ROW_TARGETS,
};

function getRandomAgentWorkRowTargets(): number[] {
  return Array.from(
    { length: AGENT_WORK_GRID_SIZE },
    () => Math.floor(Math.random() * 3) + 2,
  );
}

function getNextAgentWorkFrame(frame: AgentWorkFrame): AgentWorkFrame {
  const activeRowTarget = frame.rowTargets[frame.activeRowIndex] ?? 0;

  if (frame.activeRowPixelCount < activeRowTarget) {
    return {
      ...frame,
      activeRowPixelCount: frame.activeRowPixelCount + 1,
    };
  }

  if (frame.activeRowIndex < AGENT_WORK_GRID_SIZE - 1) {
    return {
      ...frame,
      activeRowIndex: frame.activeRowIndex + 1,
      activeRowPixelCount: 0,
    };
  }

  return {
    activeRowIndex: 0,
    activeRowPixelCount: 0,
    rowTargets: getRandomAgentWorkRowTargets(),
  };
}

function getAgentPixelOpacity(
  rowIndex: number,
  columnIndex: number,
  frame: AgentWorkFrame,
): number {
  if (rowIndex < frame.activeRowIndex) {
    return columnIndex < (frame.rowTargets[rowIndex] ?? 0) ? 1 : 0.18;
  }

  if (rowIndex === frame.activeRowIndex) {
    return columnIndex < frame.activeRowPixelCount ? 1 : 0.18;
  }

  return 0.18;
}

function drawAgentWorkCanvas(
  canvas: HTMLCanvasElement,
  frame: AgentWorkFrame,
  isProcessing: boolean,
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  const canvasSize = Math.max(
    1,
    Math.round(AGENT_WORK_CANVAS_SIZE * devicePixelRatio),
  );

  if (canvas.width !== canvasSize || canvas.height !== canvasSize) {
    canvas.width = canvasSize;
    canvas.height = canvasSize;
  }

  const color = window.getComputedStyle(canvas).color;
  let pixelSize = Math.max(1, Math.round((canvasSize * 5) / 41));
  let gapSize = Math.max(
    1,
    Math.floor(
      (canvasSize - pixelSize * AGENT_WORK_GRID_SIZE) /
        (AGENT_WORK_GRID_SIZE - 1),
    ),
  );
  let gridSize =
    pixelSize * AGENT_WORK_GRID_SIZE + gapSize * (AGENT_WORK_GRID_SIZE - 1);

  if (gridSize > canvasSize) {
    gapSize = 1;
    pixelSize = Math.max(
      1,
      Math.floor(
        (canvasSize - gapSize * (AGENT_WORK_GRID_SIZE - 1)) /
          AGENT_WORK_GRID_SIZE,
      ),
    );
    gridSize =
      pixelSize * AGENT_WORK_GRID_SIZE + gapSize * (AGENT_WORK_GRID_SIZE - 1);
  }

  const offset = Math.floor((canvasSize - gridSize) / 2);

  context.clearRect(0, 0, canvasSize, canvasSize);
  context.fillStyle = color;

  for (const pixel of AGENT_WORK_PIXELS) {
    context.globalAlpha = isProcessing
      ? getAgentPixelOpacity(pixel.row, pixel.column, frame)
      : 0.42;
    context.fillRect(
      offset + pixel.column * (pixelSize + gapSize),
      offset + pixel.row * (pixelSize + gapSize),
      pixelSize,
      pixelSize,
    );
  }

  context.globalAlpha = 1;
}

function AgentWorkIndicator({
  isProcessing,
  statusColor,
}: {
  isProcessing: boolean;
  statusColor: string;
}) {
  const [agentWorkFrame, setAgentWorkFrame] = useState<AgentWorkFrame>(
    INITIAL_AGENT_WORK_FRAME,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    drawAgentWorkCanvas(canvasRef.current, agentWorkFrame, isProcessing);
  }, [agentWorkFrame, isProcessing]);

  useEffect(() => {
    if (!isProcessing) {
      setAgentWorkFrame(INITIAL_AGENT_WORK_FRAME);
      return;
    }

    const intervalId = window.setInterval(() => {
      setAgentWorkFrame(getNextAgentWorkFrame);
    }, 180);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isProcessing]);

  return (
    <Box
      position="relative"
      w="41px"
      h="41px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      aria-hidden="true"
      color={isProcessing ? "gray.300" : "gray.200"}
    >
      <Box
        as="canvas"
        height={`${AGENT_WORK_CANVAS_SIZE}px`}
        ref={canvasRef}
        display="block"
        width={`${AGENT_WORK_CANVAS_SIZE}px`}
      />
      {!isProcessing && (
        <Box
          position="absolute"
          bottom={-1}
          right={-1}
          w={5}
          h={5}
          borderRadius="full"
          bg={`${statusColor}.solid`}
          borderWidth="3px"
          borderColor={{ base: "gray.100", _dark: "gray.900" }}
        />
      )}
    </Box>
  );
}

function formatAgentFileSize(sizeBytes: number, locale: string): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(sizeBytes / 1024)} KB`;
  }

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(sizeBytes / (1024 * 1024))} MB`;
}

function formatAgentFileDimension(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

function useAgentLiveStream(
  runId: string | null,
  isEnabled: boolean,
): AgentLiveState {
  const { user } = useAuth();
  const [state, setState] = useState<AgentLiveState>(INITIAL_AGENT_LIVE_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(
    async (id: string) => {
      if (!user) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const idToken = await user.getIdToken();
        const response = await fetch(
          `/api/agents/${encodeURIComponent(id)}/stream?startIndex=-50`,
          {
            headers: { Authorization: `Bearer ${idToken}` },
            signal: controller.signal,
          },
        );

        if (!response.ok || !response.body) {
          return;
        }

        setState((prev) => ({ ...prev, isStreaming: true }));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }

            try {
              const chunk = JSON.parse(line) as UIMessageChunk;

              setState((prev) => {
                switch (chunk.type) {
                  case "tool-input-start":
                    return { ...prev, currentToolCall: chunk.toolName };
                  case "tool-output-available":
                  case "tool-output-error":
                  case "tool-output-denied":
                    return { ...prev, currentToolCall: null };
                  case "start-step":
                    return {
                      ...prev,
                      liveStepCount: prev.liveStepCount + 1,
                    };
                  case "finish":
                  case "abort":
                    return { ...prev, currentToolCall: null };
                  default:
                    return prev;
                }
              });
            } catch {
              // malformed chunk, skip
            }
          }
        }
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          console.error("[useAgentLiveStream] stream error:", error);
        }
      } finally {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          currentToolCall: null,
        }));
      }
    },
    [user],
  );

  useEffect(() => {
    if (!isEnabled || !runId || !user) {
      abortRef.current?.abort();
      setState(INITIAL_AGENT_LIVE_STATE);
      return;
    }

    connect(runId);

    return () => {
      abortRef.current?.abort();
    };
  }, [connect, isEnabled, runId, user]);

  return state;
}

export function TaskCard({
  agent,
  locale,
  manualRunsEnabled,
  retryInputOpen,
  retryInputText,
  responseInputOpen,
  responseInputText,
  isStarting,
  isResponding,
  onRetryToggle,
  onRetryInputChange,
  onRetrySubmit,
  onResponseToggle,
  onResponseInputChange,
  onResponseSubmit,
  onApplyCatalogSetup,
  onApprove,
  onReject,
  onCancel,
  onFeedback,
  onRemove,
}: TaskCardProps) {
  const { t, i18n } = useT();

  const isProcessing =
    agent.status === "processing" || agent.status === "pending";
  const isAwaitingApproval = agent.status === "awaiting-approval";
  const isActive = isProcessing || isAwaitingApproval;
  const pendingHook = getLatestPendingHook(agent.messages);
  const [responseDecision, setResponseDecision] = useState<boolean | null>(
    null,
  );
  const pendingInteraction = getPendingInteraction(pendingHook);
  const isQuoteApprovalAwaiting =
    isAwaitingApproval && pendingHook?.hookType === "quoteApproval";
  const isFailed = agent.status === "failed" || agent.status === "rejected";
  const hasMessages = agent.messages && agent.messages.length > 0;
  const lastMessage = hasMessages
    ? getLastAssistantMessage(agent.messages ?? [])
    : null;

  const canRespond =
    isAwaitingApproval && pendingHook?.hookType === "userConfirmation";

  const collectedData = agent.result?.collectedData;
  const customerName =
    typeof collectedData?.customer === "string"
      ? collectedData.customer
      : collectedData?.customer?.name || agent.result?.customer;
  const itemCount = collectedData?.items?.length ?? agent.result?.itemCount;
  const totalPrice = collectedData?.totalPrice ?? agent.result?.totalPrice;
  const productDraft =
    agent.taskType === "product"
      ? (agent.result?.productDraft ??
        (collectedData?.draft as ProductAgentDraft | undefined))
      : undefined;
  const categoryDraft =
    agent.result?.categoryDraft ??
    collectedData?.categoryDraft ??
    (agent.taskType === "category"
      ? (collectedData?.draft as CategoryAgentDraftSummary | undefined)
      : undefined);
  const productTypeDraft =
    agent.result?.productTypeDraft ??
    collectedData?.productTypeDraft ??
    (agent.taskType === "productType"
      ? (collectedData?.draft as ProductTypeAgentDraftSummary | undefined)
      : undefined);
  const productBlockedItems =
    agent.result?.blockedItems ??
    collectedData?.blockedItems ??
    productDraft?.blockedItems ??
    [];
  const productPricePreview = collectedData?.pricePreview;
  const fileMetadata = agent.fileMetadata ?? [];
  const productCatalogChanges =
    agent.result?.catalogChanges ??
    collectedData?.catalogChanges ??
    productDraft?.catalogChanges ??
    [];
  const productReadyForCreate =
    agent.result?.readyForCreate ??
    collectedData?.readyForCreate ??
    productDraft?.readyForCreate ??
    false;
  const catalogSetupPlan =
    agent.taskType === "product"
      ? (collectedData?.catalogSetupPlan ?? undefined)
      : undefined;
  const shouldShowCatalogSetupEditor = Boolean(
    catalogSetupPlan && isCatalogSetupPendingHook(pendingHook),
  );
  const shouldShowCatalogSetupApplyPanel = Boolean(
    catalogSetupPlan && !isCatalogSetupPendingHook(pendingHook),
  );
  const pendingInteractionPreview = pendingInteraction?.body;
  const catalogSetupPlanSnapshot = JSON.stringify(catalogSetupPlan ?? null);
  const [editableCatalogSetupPlan, setEditableCatalogSetupPlan] =
    useState(catalogSetupPlan);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isApplyingCatalogSetup, setIsApplyingCatalogSetup] = useState(false);
  const [pendingFeedback, setPendingFeedback] =
    useState<AgentRunFeedbackValue | null>(null);
  const productName = productDraft?.product.name;

  const { currentToolCall, liveStepCount, isStreaming } = useAgentLiveStream(
    agent.runId,
    isProcessing,
  );
  const displayedStepCount = isProcessing ? liveStepCount : agent.stepsCount;
  const hasStepCount =
    typeof displayedStepCount === "number" && displayedStepCount > 0;
  const productPriceType =
    productDraft?.priceType ?? productDraft?.product.priceType;
  const canOpenQuoteForm =
    agent.taskType === "quote" &&
    Boolean(collectedData && (collectedData.items?.length ?? 0) > 0);
  const canOpenOrderForm =
    agent.taskType === "order" &&
    Boolean(collectedData && (collectedData.items?.length ?? 0) > 0);
  const canOpenProductForm =
    agent.taskType === "product" &&
    Boolean(productDraft?.product) &&
    productReadyForCreate &&
    productBlockedItems.length === 0;
  const canOpenCategoryForm =
    agent.taskType === "category" &&
    Boolean(categoryDraft?.category.name) &&
    categoryDraft?.readyForCreate !== false;
  const canOpenProductTypeForm =
    agent.taskType === "productType" &&
    Boolean(productTypeDraft?.productType.name) &&
    productTypeDraft?.readyForCreate !== false;
  useEffect(() => {
    setEditableCatalogSetupPlan(catalogSetupPlan);
  }, [catalogSetupPlan, catalogSetupPlanSnapshot]);

  useEffect(() => {
    setResponseDecision(null);
  }, [agent.runId, pendingHook?.toolCallId]);

  const statusColor = statusColorMap[agent.status] ?? "gray";
  const feedbackValue = agent.feedback?.value;
  const handleFeedbackClick = useCallback(
    async (value: AgentRunFeedbackValue) => {
      setPendingFeedback(value);
      try {
        await onFeedback(agent.runId, feedbackValue === value ? null : value);
      } finally {
        setPendingFeedback(null);
      }
    },
    [agent.runId, feedbackValue, onFeedback],
  );
  const handleApplyCatalogSetup = useCallback(async () => {
    if (!editableCatalogSetupPlan) {
      return;
    }

    setIsApplyingCatalogSetup(true);
    try {
      await onApplyCatalogSetup(agent.runId, editableCatalogSetupPlan);
    } finally {
      setIsApplyingCatalogSetup(false);
    }
  }, [agent.runId, editableCatalogSetupPlan, onApplyCatalogSetup]);

  return (
    <Presence
      present={true}
      animationName={{ _open: "fade-in" }}
      animationDuration="fast"
    >
      <Card.Root
        borderRadius="2xl"
        overflow="hidden"
        borderWidth={isAwaitingApproval ? "2px" : "1px"}
        borderColor={isAwaitingApproval ? "orange.muted" : "gray.muted"}
        _hover={{
          borderColor: isAwaitingApproval ? "orange.solid" : "gray.muted",
        }}
        transition="border-color 0.2s"
      >
        <Card.Body p={0}>
          {/* Header */}
          <Flex
            px={5}
            py={4}
            borderBottomWidth="1px"
            borderColor="gray.muted"
            align="center"
            gap={4}
          >
            <AgentWorkIndicator
              isProcessing={isProcessing}
              statusColor={statusColor}
            />

            {/* Title & meta */}
            <VStack align="start" gap={0.5} flex={1} minW={0}>
              <HStack gap={2}>
                <Text fontSize="md" fontWeight="semibold">
                  {t(`agents.taskType.${agent.taskType}`, {
                    defaultValue:
                      agent.taskType === "quote"
                        ? "Quote"
                        : agent.taskType === "order"
                          ? "Order"
                          : agent.taskType,
                  })}
                </Text>
                <Badge
                  size="xs"
                  colorPalette={statusColor}
                  borderRadius="full"
                  px={1.5}
                >
                  {t(`agents.status.${agent.status}`, {
                    defaultValue: agent.status,
                  })}
                </Badge>
              </HStack>
              <HStack gap={3} color="fg.muted" fontSize="xs">
                <Text>{formatRelativeTime(agent.createdAt, locale)}</Text>
                {hasStepCount && (
                  <HStack gap={1}>
                    <MaterialSymbol>steps</MaterialSymbol>
                    <Text>
                      {t("agents.stepsCount", {
                        count: displayedStepCount,
                        defaultValue: "{{count}} steps",
                      })}
                    </Text>
                  </HStack>
                )}
                {hasMessages && (
                  <HStack gap={1}>
                    <MaterialSymbol>chat</MaterialSymbol>
                    <Text>
                      {agent.messages?.length}{" "}
                      {t("agents.messages", { defaultValue: "messages" })}
                    </Text>
                  </HStack>
                )}
                {fileMetadata.length > 0 && (
                  <HStack gap={1}>
                    <MaterialSymbol>attach_file</MaterialSymbol>
                    <Text>
                      {t("agents.files.count", {
                        count: fileMetadata.length,
                        defaultValue: "{{count}} files",
                      })}
                    </Text>
                  </HStack>
                )}
                {isStreaming && (
                  <HStack gap={1} color="primary.fg">
                    <MaterialSymbol>progress_activity</MaterialSymbol>
                    <Text>{t("agents.live", { defaultValue: "live" })}</Text>
                  </HStack>
                )}
              </HStack>
            </VStack>

            {/* Actions */}
            <HStack gap={2}>
              {canOpenQuoteForm && (
                <ButtonLink
                  lng={locale}
                  href={`/quotes/create?agentRunId=${agent.runId}`}
                  variant="solid"
                  size="sm"
                  borderRadius="full"
                  ariaLabel={t("agents.openQuoteForm", {
                    defaultValue: "Open in quote form",
                  })}
                >
                  <MaterialSymbol>description</MaterialSymbol>
                  {t("agents.openQuoteForm", {
                    defaultValue: "Open in quote form",
                  })}
                </ButtonLink>
              )}

              {canOpenOrderForm && (
                <ButtonLink
                  lng={locale}
                  href={`/orders/create?agentRunId=${agent.runId}`}
                  variant="solid"
                  size="sm"
                  borderRadius="full"
                  ariaLabel={t("agents.openOrderForm", {
                    defaultValue: "Open in order form",
                  })}
                >
                  <MaterialSymbol>description</MaterialSymbol>
                  {t("agents.openOrderForm", {
                    defaultValue: "Open in order form",
                  })}
                </ButtonLink>
              )}

              {canOpenProductForm && (
                <ButtonLink
                  lng={locale}
                  href={`${ADMIN_CATALOG_PRODUCTS_CREATE}?agentRunId=${agent.runId}`}
                  variant="solid"
                  size="sm"
                  borderRadius="full"
                  ariaLabel={t("agents.openProductForm", {
                    defaultValue: "Open in product form",
                  })}
                >
                  <MaterialSymbol>description</MaterialSymbol>
                  {t("agents.openProductForm", {
                    defaultValue: "Open in product form",
                  })}
                </ButtonLink>
              )}

              {canOpenCategoryForm && (
                <ButtonLink
                  lng={locale}
                  href={`${ADMIN_CATALOG}?create=category&agentRunId=${agent.runId}`}
                  variant="solid"
                  size="sm"
                  borderRadius="full"
                  ariaLabel={t("agents.openCategoryForm", {
                    defaultValue: "Open in category form",
                  })}
                >
                  <MaterialSymbol>category</MaterialSymbol>
                  {t("agents.openCategoryForm", {
                    defaultValue: "Open in category form",
                  })}
                </ButtonLink>
              )}

              {canOpenProductTypeForm && (
                <ButtonLink
                  lng={locale}
                  href={`${ADMIN_CONFIG_PRODUCT_TYPES}?type=create-new&agentRunId=${agent.runId}`}
                  variant="solid"
                  size="sm"
                  borderRadius="full"
                  ariaLabel={t("agents.openProductTypeForm", {
                    defaultValue: "Open in product type form",
                  })}
                >
                  <MaterialSymbol>schema</MaterialSymbol>
                  {t("agents.openProductTypeForm", {
                    defaultValue: "Open in product type form",
                  })}
                </ButtonLink>
              )}

              {isQuoteApprovalAwaiting && (
                <>
                  <Button
                    size="sm"
                    colorPalette="success"
                    borderRadius="full"
                    onClick={() => onApprove(agent.runId)}
                  >
                    <MaterialSymbol>check</MaterialSymbol>
                    {t("agents.approve", { defaultValue: "Approve" })}
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="red"
                    variant="outline"
                    borderRadius="full"
                    onClick={() => onReject(agent.runId)}
                  >
                    <MaterialSymbol>close</MaterialSymbol>
                    {t("agents.reject", { defaultValue: "Reject" })}
                  </Button>
                </>
              )}
              {isFailed && manualRunsEnabled && (
                <Button
                  size="sm"
                  variant="outline"
                  colorPalette="orange"
                  borderRadius="full"
                  onClick={() => onRetryToggle(agent.runId)}
                >
                  <MaterialSymbol>
                    {retryInputOpen ? "close" : "refresh"}
                  </MaterialSymbol>
                  {retryInputOpen
                    ? t("agents.cancelRetry", { defaultValue: "Cancel" })
                    : t("agents.retry", { defaultValue: "Retry" })}
                </Button>
              )}
              {isActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  borderRadius="full"
                  onClick={() => onCancel(agent.runId)}
                >
                  <MaterialSymbol>stop</MaterialSymbol>
                  {t("agents.cancel", { defaultValue: "Stop" })}
                </Button>
              )}
              <IconButton
                size="sm"
                colorPalette={feedbackValue === "positive" ? "success" : "gray"}
                variant={feedbackValue === "positive" ? "subtle" : "ghost"}
                borderRadius="full"
                onClick={() => void handleFeedbackClick("positive")}
                loading={pendingFeedback === "positive"}
                aria-label={t("agents.feedback.positive", {
                  defaultValue: "Mark run helpful",
                })}
                bg="transparent"
              >
                <MaterialSymbol>thumb_up</MaterialSymbol>
              </IconButton>
              <IconButton
                size="sm"
                colorPalette={feedbackValue === "negative" ? "red" : "gray"}
                variant={feedbackValue === "negative" ? "subtle" : "ghost"}
                borderRadius="full"
                onClick={() => void handleFeedbackClick("negative")}
                loading={pendingFeedback === "negative"}
                aria-label={t("agents.feedback.negative", {
                  defaultValue: "Mark run not helpful",
                })}
                bg="transparent"
              >
                <MaterialSymbol>thumb_down</MaterialSymbol>
              </IconButton>
              <IconButton
                size="sm"
                color="red.solid"
                variant="ghost"
                borderRadius="full"
                onClick={() => onRemove(agent.runId)}
                aria-label={
                  isActive
                    ? t("agents.stopAndRemove", {
                        defaultValue: "Stop and remove",
                      })
                    : t("agents.remove", { defaultValue: "Remove" })
                }
              >
                <MaterialSymbol>delete</MaterialSymbol>
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                borderRadius="full"
                onClick={() => setDetailsOpen(true)}
                aria-label={t("agents.viewDetails", {
                  defaultValue: "View details",
                })}
              >
                <MaterialSymbol>fullscreen</MaterialSymbol>
              </IconButton>
            </HStack>
          </Flex>

          {/* Progress bar */}
          {isProcessing && (
            <Progress.Root
              colorPalette={"primary"}
              size="xs"
              value={null}
              borderRadius={0}
            >
              <Progress.Track borderRadius={0}>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
          )}

          {/* Content */}
          <Grid px={5} py={4} gap={4} templateColumns="1fr">
            <Box minW={0}>
              {/* Live tool call indicator while processing */}
              {isProcessing && currentToolCall && (
                <Text
                  mb={3}
                  px={2}
                  py={2}
                  fontWeight="bold"
                  fontSize="sm"
                  bgImage={themeGradients.chatShimmer}
                  bgClip="text"
                  backgroundSize="400% 100%"
                  animation="shimmerText"
                  color="transparent"
                  lineClamp={1}
                >
                  {t(`agents.tools.${currentToolCall}`, {
                    defaultValue: currentToolCall
                      .replace(/([A-Z])/g, " $1")
                      .trim()
                      .replace(/^\w/, (c) => c.toUpperCase()),
                  })}
                </Text>
              )}

              {/* Last message or prompt preview */}
              <Text fontSize="sm" color="fg.muted" lineClamp={2} mb={3}>
                {pendingInteractionPreview ??
                  lastMessage ??
                  agent.currentStep ??
                  (isAwaitingApproval
                    ? t("agents.waitingForApproval", {
                        defaultValue:
                          "Ready for review. Please approve or reject.",
                      })
                    : agent.prompt)}
              </Text>

              {/* Result badges */}
              {(customerName ||
                itemCount ||
                totalPrice ||
                productName ||
                productPriceType ||
                productBlockedItems.length > 0) && (
                <HStack gap={2} flexWrap="wrap" mb={3}>
                  {customerName && (
                    <Badge
                      variant="outline"
                      size="sm"
                      borderRadius="full"
                      gap={1}
                    >
                      <MaterialSymbol>person</MaterialSymbol>
                      {customerName}
                    </Badge>
                  )}
                  {itemCount !== undefined && itemCount > 0 && (
                    <Badge
                      variant="outline"
                      size="sm"
                      borderRadius="full"
                      gap={1}
                    >
                      <MaterialSymbol>inventory_2</MaterialSymbol>
                      {t("agents.itemsCount", {
                        defaultValue: "{{count}} items",
                        count: itemCount,
                      })}
                    </Badge>
                  )}
                  {totalPrice !== undefined && totalPrice > 0 && (
                    <Badge
                      variant="solid"
                      size="sm"
                      colorPalette="success"
                      borderRadius="full"
                    >
                      {formatPrice(
                        totalPrice,
                        CurrencyEnum.PLN,
                        undefined,
                        undefined,
                        i18n.resolvedLanguage ?? locale,
                      )}
                    </Badge>
                  )}
                  {productName && (
                    <Badge
                      variant="outline"
                      size="sm"
                      borderRadius="full"
                      gap={1}
                    >
                      <MaterialSymbol>inventory</MaterialSymbol>
                      {productName}
                    </Badge>
                  )}
                  {productPriceType && (
                    <Badge
                      variant="outline"
                      size="sm"
                      borderRadius="full"
                      gap={1}
                    >
                      <MaterialSymbol>sell</MaterialSymbol>
                      {t(`PriceTypeEnum.${productPriceType}`)}
                    </Badge>
                  )}
                  {productBlockedItems.length > 0 && (
                    <Badge
                      variant="outline"
                      size="sm"
                      colorPalette="orange"
                      borderRadius="full"
                      gap={1}
                    >
                      <MaterialSymbol>block</MaterialSymbol>
                      {t("agents.blockedCount", {
                        defaultValue: "{{count}} blocked",
                        count: productBlockedItems.length,
                      })}
                    </Badge>
                  )}
                </HStack>
              )}

              {/* Estimated time */}
              {isProcessing && agent.estimatedTimeLeft && (
                <Text fontSize="xs" color="fg.muted" mb={3}>
                  <MaterialSymbol>schedule</MaterialSymbol>{" "}
                  {t("agents.estimatedTime", {
                    defaultValue: "~{{time}} remaining",
                    time: formatTimeLeft(agent.estimatedTimeLeft),
                  })}
                </Text>
              )}

              {/* Error display */}
              {agent.error && (
                <Card.Root
                  variant="outline"
                  colorPalette="red"
                  borderRadius="xl"
                  mb={3}
                >
                  <Card.Body py={3} px={4}>
                    <HStack gap={2}>
                      <MaterialSymbol>error</MaterialSymbol>
                      <Text fontSize="sm">
                        {typeof agent.error === "string"
                          ? agent.error
                          : ((agent.error as { message?: string })?.message ??
                            JSON.stringify(agent.error))}
                      </Text>
                    </HStack>
                  </Card.Body>
                </Card.Root>
              )}

              {/* Retry input */}
              {manualRunsEnabled && (
                <Collapsible.Root open={retryInputOpen}>
                  <Collapsible.Content>
                    <Card.Root
                      variant="outline"
                      colorPalette="orange"
                      borderRadius="xl"
                      mb={3}
                    >
                      <Card.Body py={4} px={4}>
                        <VStack align="stretch" gap={3}>
                          <Text fontSize="sm" fontWeight="medium">
                            {t("agents.retryPrompt", {
                              defaultValue:
                                "Provide additional information to help the agent:",
                            })}
                          </Text>
                          <Text fontSize="xs" color="fg.muted">
                            {t("agents.retryHint", {
                              defaultValue:
                                "For example, provide the correct customer name, email, or NIP number if the search failed.",
                            })}
                          </Text>
                          <Textarea
                            value={retryInputText}
                            onChange={(e) => onRetryInputChange(e.target.value)}
                            placeholder={t("agents.retryPlaceholder", {
                              defaultValue:
                                "e.g., The customer's email is jan@example.com",
                            })}
                            size="sm"
                            rows={3}
                            borderRadius="xl"
                          />
                          <HStack gap={2} justify="flex-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              borderRadius="full"
                              onClick={() => onRetryToggle(agent.runId)}
                            >
                              {t("common.cancel", { defaultValue: "Cancel" })}
                            </Button>
                            <Button
                              size="sm"
                              colorPalette="primary"
                              borderRadius="full"
                              onClick={() => onRetrySubmit(agent.runId)}
                              disabled={!retryInputText.trim()}
                              loading={isStarting}
                            >
                              <MaterialSymbol>play_arrow</MaterialSymbol>
                              {t("agents.continueAgent", {
                                defaultValue: "Continue Agent",
                              })}
                            </Button>
                          </HStack>
                        </VStack>
                      </Card.Body>
                    </Card.Root>
                  </Collapsible.Content>
                </Collapsible.Root>
              )}

              {/* Response input for agents that can receive responses */}
              {canRespond && (
                <Box mb={3}>
                  {pendingInteraction && (
                    <AgentInteractionPanel
                      interaction={pendingInteraction}
                      selectedValue={responseInputText}
                      labels={{
                        prefilledData: t("agents.interaction.prefilledData", {
                          defaultValue: "Prefilled data",
                        }),
                        selected: t("agents.interaction.selected", {
                          defaultValue: "Selected",
                        }),
                        titleFallback: t("agents.interaction.pendingQuestion", {
                          defaultValue: "Agent question",
                        }),
                        valueLabel: t("agents.interaction.valueLabel", {
                          defaultValue: "ID",
                        }),
                      }}
                      onSelectValue={(value) => {
                        setResponseDecision(true);
                        onResponseInputChange(value);
                        if (!responseInputOpen) {
                          onResponseToggle(agent.runId);
                        }
                      }}
                    />
                  )}
                  <Collapsible.Root open={responseInputOpen}>
                    <Collapsible.Content>
                      <Card.Root
                        variant="outline"
                        colorPalette="primary"
                        borderRadius="xl"
                        mb={2}
                      >
                        <Card.Body py={4} px={4}>
                          <VStack align="stretch" gap={3}>
                            <Text fontSize="sm" fontWeight="medium">
                              {t("agents.responsePrompt", {
                                defaultValue: "Respond to the agent:",
                              })}
                            </Text>
                            {productDraft && (
                              <ProductDraftPricePreview
                                draft={productDraft}
                                locale={i18n.resolvedLanguage ?? locale}
                                pricePreview={productPricePreview}
                                t={t}
                              />
                            )}
                            {shouldShowCatalogSetupEditor &&
                              editableCatalogSetupPlan && (
                                <Box>
                                  <Text fontSize="sm" color="fg.muted" mb={3}>
                                    {t("agents.catalogSetup.editPrompt", {
                                      defaultValue:
                                        "Review and edit the catalog changes before confirming.",
                                    })}
                                  </Text>
                                  <ProductCatalogSetupEditor
                                    plan={editableCatalogSetupPlan}
                                    onChange={setEditableCatalogSetupPlan}
                                  />
                                </Box>
                              )}
                            <Textarea
                              value={responseInputText}
                              onChange={(e) => {
                                setResponseDecision(null);
                                onResponseInputChange(e.target.value);
                              }}
                              placeholder={t("agents.responsePlaceholder", {
                                defaultValue:
                                  "e.g., Yes, that's the correct customer",
                              })}
                              size="sm"
                              rows={2}
                              borderRadius="xl"
                              autoFocus
                            />
                            <HStack gap={2} flexWrap="wrap">
                              <Button
                                size="xs"
                                variant="outline"
                                borderRadius="full"
                                onClick={() => {
                                  setResponseDecision(true);
                                  onResponseInputChange(
                                    t("agents.quickYes", {
                                      defaultValue: "Yes",
                                    }),
                                  );
                                }}
                              >
                                <MaterialSymbol>check</MaterialSymbol>
                                {t("agents.quickYes", { defaultValue: "Yes" })}
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                borderRadius="full"
                                onClick={() => {
                                  setResponseDecision(false);
                                  onResponseInputChange(
                                    t("agents.quickNo", { defaultValue: "No" }),
                                  );
                                }}
                              >
                                <MaterialSymbol>close</MaterialSymbol>
                                {t("agents.quickNo", { defaultValue: "No" })}
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                borderRadius="full"
                                onClick={() => {
                                  setResponseDecision(true);
                                  onResponseInputChange(
                                    t("agents.quickContinue", {
                                      defaultValue: "Continue",
                                    }),
                                  );
                                }}
                              >
                                <MaterialSymbol>arrow_forward</MaterialSymbol>
                                {t("agents.quickContinue", {
                                  defaultValue: "Continue",
                                })}
                              </Button>
                            </HStack>
                            <HStack gap={2} justify="flex-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                borderRadius="full"
                                onClick={() => onResponseToggle(agent.runId)}
                              >
                                {t("common.cancel", { defaultValue: "Cancel" })}
                              </Button>
                              <Button
                                size="sm"
                                colorPalette="primary"
                                borderRadius="full"
                                onClick={() =>
                                  onResponseSubmit(agent.runId, {
                                    ...(pendingHook?.hookType ===
                                    "quoteApproval"
                                      ? { approved: responseDecision ?? true }
                                      : {
                                          confirmed: responseDecision ?? true,
                                        }),
                                    ...(shouldShowCatalogSetupEditor &&
                                    editableCatalogSetupPlan
                                      ? {
                                          catalogSetupPlan:
                                            editableCatalogSetupPlan,
                                        }
                                      : {}),
                                    response:
                                      responseInputText.trim() ||
                                      (shouldShowCatalogSetupEditor &&
                                      editableCatalogSetupPlan
                                        ? t(
                                            "agents.catalogSetup.confirmEdited",
                                            {
                                              defaultValue:
                                                "Yes, create the catalog changes with these edits.",
                                            },
                                          )
                                        : ""),
                                  })
                                }
                                disabled={
                                  !responseInputText.trim() &&
                                  !(
                                    shouldShowCatalogSetupEditor &&
                                    editableCatalogSetupPlan
                                  )
                                }
                                loading={isResponding}
                              >
                                <MaterialSymbol>send</MaterialSymbol>
                                {t("agents.sendResponse", {
                                  defaultValue: "Send",
                                })}
                              </Button>
                            </HStack>
                          </VStack>
                        </Card.Body>
                      </Card.Root>
                    </Collapsible.Content>
                  </Collapsible.Root>
                  {!responseInputOpen && (
                    <Button
                      size="sm"
                      variant="outline"
                      borderRadius="full"
                      width="full"
                      onClick={() => onResponseToggle(agent.runId)}
                    >
                      <MaterialSymbol>chat</MaterialSymbol>
                      {t("agents.respondToAgent", {
                        defaultValue: "Respond to Agent",
                      })}
                    </Button>
                  )}
                </Box>
              )}

              {/* Details dialog */}
              <Dialog.Root
                open={detailsOpen}
                onOpenChange={(d) => setDetailsOpen(d.open)}
                size="xl"
                scrollBehavior="inside"
                lazyMount
                unmountOnExit
              >
                <Portal>
                  <Dialog.Backdrop />
                  <Dialog.Positioner>
                    <Dialog.Content>
                      <Dialog.Header>
                        <Dialog.Title>
                          <HStack gap={2}>
                            <Text>
                              {t(`agents.taskType.${agent.taskType}`, {
                                defaultValue: agent.taskType,
                              })}
                            </Text>
                            <Badge
                              size="xs"
                              variant="outline"
                              colorPalette={statusColor}
                              borderRadius="full"
                            >
                              {t(`agents.status.${agent.status}`, {
                                defaultValue: agent.status,
                              })}
                            </Badge>
                          </HStack>
                        </Dialog.Title>
                      </Dialog.Header>
                      <Dialog.CloseTrigger />
                      <Dialog.Body pb={6}>
                        <VStack align="stretch" gap={6}>
                          {/* Full conversation with tool calls */}
                          <TaskMessages
                            messages={agent.messages}
                            locale={locale}
                            showToolCalls
                          />

                          {/* Details card */}
                          <Card.Root variant="outline" borderRadius="2xl">
                            <Card.Body py={4} px={4}>
                              <VStack align="stretch" gap={4}>
                                {fileMetadata.length > 0 && (
                                  <Box>
                                    <HStack gap={2} mb={2}>
                                      <MaterialSymbol color="fg.muted">
                                        attach_file
                                      </MaterialSymbol>
                                      <Text
                                        fontSize="xs"
                                        fontWeight="medium"
                                        color="fg.muted"
                                        textTransform="uppercase"
                                        letterSpacing="wide"
                                      >
                                        {t("agents.files.attached", {
                                          defaultValue: "Attached files",
                                        })}
                                      </Text>
                                    </HStack>
                                    <VStack align="stretch" gap={2}>
                                      {fileMetadata.map((metadata, index) => {
                                        const firstPage = metadata.pages[0];
                                        const dimensions =
                                          firstPage?.widthMm &&
                                          firstPage.heightMm
                                            ? t("agents.files.dimensionsMm", {
                                                defaultValue:
                                                  "{{width}} x {{height}} mm",
                                                height:
                                                  formatAgentFileDimension(
                                                    firstPage.heightMm,
                                                    locale,
                                                  ),
                                                width: formatAgentFileDimension(
                                                  firstPage.widthMm,
                                                  locale,
                                                ),
                                              })
                                            : firstPage?.widthPx &&
                                                firstPage.heightPx
                                              ? t("agents.files.dimensionsPx", {
                                                  defaultValue:
                                                    "{{width}} x {{height}} px",
                                                  height:
                                                    formatAgentFileDimension(
                                                      firstPage.heightPx,
                                                      locale,
                                                    ),
                                                  width:
                                                    formatAgentFileDimension(
                                                      firstPage.widthPx,
                                                      locale,
                                                    ),
                                                })
                                              : metadata.contentType;

                                        return (
                                          <Flex
                                            key={`${metadata.filename}-${index}`}
                                            align="center"
                                            justify="space-between"
                                            gap={3}
                                            p={3}
                                            borderRadius="xl"
                                            borderWidth="1px"
                                            borderColor={{
                                              base: "gray.200",
                                              _dark: "gray.700",
                                            }}
                                          >
                                            <Box minW={0}>
                                              <Text
                                                fontSize="sm"
                                                fontWeight="medium"
                                                truncate
                                              >
                                                {metadata.filename}
                                              </Text>
                                              <Text
                                                color="fg.muted"
                                                fontSize="xs"
                                              >
                                                {t("agents.files.pageCount", {
                                                  count: metadata.pageCount,
                                                  defaultValue:
                                                    "{{count}} pages",
                                                })}
                                                {" · "}
                                                {dimensions}
                                              </Text>
                                            </Box>
                                            <Text
                                              color="fg.muted"
                                              flexShrink={0}
                                              fontSize="xs"
                                            >
                                              {formatAgentFileSize(
                                                metadata.sizeBytes,
                                                locale,
                                              )}
                                            </Text>
                                          </Flex>
                                        );
                                      })}
                                    </VStack>
                                  </Box>
                                )}

                                {collectedData && (
                                  <>
                                    {collectedData.customer && (
                                      <Box>
                                        <HStack gap={2} mb={1}>
                                          <MaterialSymbol color="fg.muted">
                                            person
                                          </MaterialSymbol>
                                          <Text
                                            fontSize="xs"
                                            fontWeight="medium"
                                            color="fg.muted"
                                            textTransform="uppercase"
                                            letterSpacing="wide"
                                          >
                                            {t("agents.customer", {
                                              defaultValue: "Customer",
                                            })}
                                          </Text>
                                        </HStack>
                                        <Text fontSize="sm">
                                          {typeof collectedData.customer ===
                                          "string"
                                            ? collectedData.customer
                                            : collectedData.customer.name ||
                                              JSON.stringify(
                                                collectedData.customer,
                                              )}
                                        </Text>
                                      </Box>
                                    )}
                                    {collectedData.items &&
                                      collectedData.items.length > 0 && (
                                        <Box>
                                          <HStack gap={2} mb={2}>
                                            <MaterialSymbol color="fg.muted">
                                              inventory_2
                                            </MaterialSymbol>
                                            <Text
                                              fontSize="xs"
                                              fontWeight="medium"
                                              color="fg.muted"
                                              textTransform="uppercase"
                                              letterSpacing="wide"
                                            >
                                              {t("agents.items", {
                                                defaultValue: "Items",
                                              })}
                                            </Text>
                                          </HStack>
                                          <VStack align="stretch" gap={2}>
                                            {collectedData.items.map(
                                              (item, idx) => (
                                                <Flex
                                                  key={`${item.productName}-${idx}`}
                                                  justify="space-between"
                                                  p={3}
                                                  borderRadius="xl"
                                                  borderWidth="1px"
                                                  borderColor={{
                                                    base: "gray.200",
                                                    _dark: "gray.700",
                                                  }}
                                                >
                                                  <Text fontSize="sm">
                                                    {item.quantity}x{" "}
                                                    {item.productName}
                                                  </Text>
                                                  {item.totalPrice !==
                                                    undefined && (
                                                    <Text
                                                      fontSize="sm"
                                                      fontWeight="semibold"
                                                    >
                                                      {formatPrice(
                                                        item.totalPrice,
                                                      )}
                                                    </Text>
                                                  )}
                                                </Flex>
                                              ),
                                            )}
                                          </VStack>
                                        </Box>
                                      )}
                                    {totalPrice !== undefined && (
                                      <Flex
                                        justify="space-between"
                                        align="center"
                                        pt={2}
                                        borderTopWidth="1px"
                                        borderColor={{
                                          base: "gray.200",
                                          _dark: "gray.700",
                                        }}
                                      >
                                        <Text fontSize="sm" fontWeight="medium">
                                          {t("agents.totalPrice", {
                                            defaultValue: "Total",
                                          })}
                                        </Text>
                                        <Text
                                          fontSize="xl"
                                          fontWeight="bold"
                                          color="success.solid"
                                        >
                                          {formatPrice(totalPrice)}
                                        </Text>
                                      </Flex>
                                    )}
                                  </>
                                )}

                                {productDraft && (
                                  <Box>
                                    <HStack gap={2} mb={2}>
                                      <MaterialSymbol color="fg.muted">
                                        inventory
                                      </MaterialSymbol>
                                      <Text
                                        fontSize="xs"
                                        fontWeight="medium"
                                        color="fg.muted"
                                        textTransform="uppercase"
                                        letterSpacing="wide"
                                      >
                                        {t("agents.productDraft", {
                                          defaultValue: "Product draft",
                                        })}
                                      </Text>
                                    </HStack>
                                    <VStack align="stretch" gap={2}>
                                      <Flex
                                        justify="space-between"
                                        p={3}
                                        borderRadius="xl"
                                        borderWidth="1px"
                                        borderColor={{
                                          base: "gray.200",
                                          _dark: "gray.700",
                                        }}
                                      >
                                        <Text fontSize="sm" fontWeight="medium">
                                          {productDraft.product.name}
                                        </Text>
                                        <Badge size="sm" variant="outline">
                                          {t(
                                            `PriceTypeEnum.${productDraft.priceType}`,
                                          )}
                                        </Badge>
                                      </Flex>
                                      <Text fontSize="sm" color="fg.muted">
                                        {productDraft.reviewSummary}
                                      </Text>
                                      <ProductDraftPricePreview
                                        draft={productDraft}
                                        locale={i18n.resolvedLanguage ?? locale}
                                        pricePreview={productPricePreview}
                                        t={t}
                                      />
                                      {(shouldShowCatalogSetupApplyPanel ||
                                        productCatalogChanges.length > 0) && (
                                        <Box
                                          borderWidth="1px"
                                          borderColor={{
                                            base: "orange.200",
                                            _dark: "orange.700",
                                          }}
                                          bg={{
                                            base: "orange.50",
                                            _dark: "orange.950",
                                          }}
                                          borderRadius="lg"
                                          p={4}
                                        >
                                          <VStack align="stretch" gap={3}>
                                            <HStack
                                              gap={2}
                                              justify="space-between"
                                              align="start"
                                              flexWrap="wrap"
                                            >
                                              <Box>
                                                <HStack gap={2}>
                                                  <MaterialSymbol color="orange.fg">
                                                    construction
                                                  </MaterialSymbol>
                                                  <Text
                                                    fontSize="sm"
                                                    fontWeight="semibold"
                                                  >
                                                    {t(
                                                      "agents.catalogSetup.prerequisitesTitle",
                                                      {
                                                        defaultValue:
                                                          "Catalog prerequisites",
                                                      },
                                                    )}
                                                  </Text>
                                                </HStack>
                                                <Text
                                                  fontSize="xs"
                                                  color="fg.muted"
                                                  mt={1}
                                                >
                                                  {t(
                                                    "agents.catalogSetup.prerequisitesDescription",
                                                    {
                                                      defaultValue:
                                                        "Apply these catalog changes before opening the product form.",
                                                    },
                                                  )}
                                                </Text>
                                              </Box>
                                              {catalogSetupPlan && (
                                                <HStack gap={1} flexWrap="wrap">
                                                  <Badge
                                                    size="sm"
                                                    variant="subtle"
                                                  >
                                                    {t(
                                                      "agents.catalogSetup.attributeCount",
                                                      {
                                                        count:
                                                          catalogSetupPlan
                                                            .attributes.length,
                                                        defaultValue:
                                                          "{{count}} attributes",
                                                      },
                                                    )}
                                                  </Badge>
                                                  <Badge
                                                    size="sm"
                                                    variant="subtle"
                                                  >
                                                    {t(
                                                      "agents.catalogSetup.optionGroupCount",
                                                      {
                                                        count:
                                                          catalogSetupPlan
                                                            .options.length,
                                                        defaultValue:
                                                          "{{count}} option groups",
                                                      },
                                                    )}
                                                  </Badge>
                                                </HStack>
                                              )}
                                            </HStack>

                                            {productCatalogChanges.length >
                                              0 && (
                                              <VStack align="stretch" gap={1}>
                                                {productCatalogChanges.map(
                                                  (
                                                    change: ProductAgentCatalogChange,
                                                  ) => (
                                                    <HStack
                                                      key={change.id}
                                                      gap={2}
                                                      justify="space-between"
                                                      align="center"
                                                    >
                                                      <Text fontSize="xs">
                                                        {change.kind}
                                                      </Text>
                                                      <Badge
                                                        size="sm"
                                                        variant="outline"
                                                      >
                                                        {change.status}
                                                      </Badge>
                                                    </HStack>
                                                  ),
                                                )}
                                              </VStack>
                                            )}

                                            {shouldShowCatalogSetupApplyPanel &&
                                              editableCatalogSetupPlan && (
                                                <>
                                                  <ProductCatalogSetupEditor
                                                    plan={
                                                      editableCatalogSetupPlan
                                                    }
                                                    onChange={
                                                      setEditableCatalogSetupPlan
                                                    }
                                                  />
                                                  <HStack justify="flex-end">
                                                    <Button
                                                      size="sm"
                                                      colorPalette="orange"
                                                      loading={
                                                        isApplyingCatalogSetup
                                                      }
                                                      onClick={
                                                        handleApplyCatalogSetup
                                                      }
                                                    >
                                                      <MaterialSymbol>
                                                        playlist_add_check
                                                      </MaterialSymbol>
                                                      {t(
                                                        "agents.catalogSetup.apply",
                                                        {
                                                          defaultValue:
                                                            "Apply catalog changes",
                                                        },
                                                      )}
                                                    </Button>
                                                  </HStack>
                                                </>
                                              )}
                                          </VStack>
                                        </Box>
                                      )}
                                      {productBlockedItems.length > 0 && (
                                        <Card.Root
                                          variant="outline"
                                          colorPalette="orange"
                                          borderRadius="xl"
                                        >
                                          <Card.Body py={3} px={4}>
                                            <VStack align="stretch" gap={2}>
                                              <Text
                                                fontSize="sm"
                                                fontWeight="medium"
                                              >
                                                {t("agents.blockedItems", {
                                                  defaultValue: "Blocked items",
                                                })}
                                              </Text>
                                              {productBlockedItems.map(
                                                (item, index) => (
                                                  <Text
                                                    key={`${item.type}-${item.label}-${index}`}
                                                    fontSize="xs"
                                                  >
                                                    {index + 1}. [blocked]{" "}
                                                    {item.label}: {item.reason}
                                                  </Text>
                                                ),
                                              )}
                                            </VStack>
                                          </Card.Body>
                                        </Card.Root>
                                      )}
                                    </VStack>
                                  </Box>
                                )}

                                {categoryDraft && (
                                  <Box>
                                    <HStack gap={2} mb={2}>
                                      <MaterialSymbol color="fg.muted">
                                        category
                                      </MaterialSymbol>
                                      <Text
                                        fontSize="xs"
                                        fontWeight="medium"
                                        color="fg.muted"
                                        textTransform="uppercase"
                                        letterSpacing="wide"
                                      >
                                        {t("agents.categoryDraft", {
                                          defaultValue: "Category draft",
                                        })}
                                      </Text>
                                    </HStack>
                                    <VStack align="stretch" gap={2}>
                                      <Flex
                                        justify="space-between"
                                        p={3}
                                        borderRadius="xl"
                                        borderWidth="1px"
                                        borderColor={{
                                          base: "gray.200",
                                          _dark: "gray.700",
                                        }}
                                      >
                                        <Text fontSize="sm" fontWeight="medium">
                                          {categoryDraft.category.name}
                                        </Text>
                                        {categoryDraft.category.seo?.slug && (
                                          <Badge size="sm" variant="outline">
                                            {categoryDraft.category.seo.slug}
                                          </Badge>
                                        )}
                                      </Flex>
                                      {categoryDraft.reviewSummary && (
                                        <Text fontSize="sm" color="fg.muted">
                                          {categoryDraft.reviewSummary}
                                        </Text>
                                      )}
                                    </VStack>
                                  </Box>
                                )}

                                {productTypeDraft && (
                                  <Box>
                                    <HStack gap={2} mb={2}>
                                      <MaterialSymbol color="fg.muted">
                                        schema
                                      </MaterialSymbol>
                                      <Text
                                        fontSize="xs"
                                        fontWeight="medium"
                                        color="fg.muted"
                                        textTransform="uppercase"
                                        letterSpacing="wide"
                                      >
                                        {t("agents.productTypeDraft", {
                                          defaultValue: "Product type draft",
                                        })}
                                      </Text>
                                    </HStack>
                                    <VStack align="stretch" gap={2}>
                                      <Flex
                                        justify="space-between"
                                        p={3}
                                        borderRadius="xl"
                                        borderWidth="1px"
                                        borderColor={{
                                          base: "gray.200",
                                          _dark: "gray.700",
                                        }}
                                      >
                                        <Text fontSize="sm" fontWeight="medium">
                                          {productTypeDraft.productType.name}
                                        </Text>
                                        <Badge size="sm" variant="outline">
                                          {productTypeDraft.productType.id}
                                        </Badge>
                                      </Flex>
                                      <HStack gap={2} flexWrap="wrap">
                                        <Badge size="sm" variant="subtle">
                                          {t("agents.productTypeAttributes", {
                                            count:
                                              productTypeDraft.productType
                                                .attributes.length,
                                            defaultValue:
                                              "{{count}} attributes",
                                          })}
                                        </Badge>
                                        <Badge size="sm" variant="subtle">
                                          {productTypeDraft.productType
                                            .isShippable
                                            ? t("agents.shippable", {
                                                defaultValue: "Shippable",
                                              })
                                            : t("agents.notShippable", {
                                                defaultValue: "Not shippable",
                                              })}
                                        </Badge>
                                      </HStack>
                                      {productTypeDraft.reviewSummary && (
                                        <Text fontSize="sm" color="fg.muted">
                                          {productTypeDraft.reviewSummary}
                                        </Text>
                                      )}
                                    </VStack>
                                  </Box>
                                )}

                                {/* Run ID */}
                                <Box
                                  pt={2}
                                  borderTopWidth="1px"
                                  borderColor={{
                                    base: "gray.200",
                                    _dark: "gray.700",
                                  }}
                                >
                                  <HStack gap={2} mb={1}>
                                    <MaterialSymbol color="fg.muted">
                                      tag
                                    </MaterialSymbol>
                                    <Text
                                      fontSize="xs"
                                      fontWeight="medium"
                                      color="fg.muted"
                                      textTransform="uppercase"
                                      letterSpacing="wide"
                                    >
                                      {t("agents.runId", {
                                        defaultValue: "Run ID",
                                      })}
                                    </Text>
                                  </HStack>
                                  <Text
                                    fontSize="xs"
                                    fontFamily="mono"
                                    color="fg.muted"
                                  >
                                    {agent.runId}
                                  </Text>
                                </Box>
                              </VStack>
                            </Card.Body>
                          </Card.Root>
                        </VStack>
                      </Dialog.Body>
                    </Dialog.Content>
                  </Dialog.Positioner>
                </Portal>
              </Dialog.Root>
            </Box>
          </Grid>
        </Card.Body>
      </Card.Root>
    </Presence>
  );
}

export default TaskCard;
