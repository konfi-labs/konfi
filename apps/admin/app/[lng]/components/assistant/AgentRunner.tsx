"use client";

import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  Card,
  Collapsible,
  HStack,
  IconButton,
  Progress,
  ProgressCircle,
  Status,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useCallback, useState } from "react";

export type AgentStatus =
  | "pending"
  | "processing"
  | "awaiting-approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

export interface AgentRun {
  id: string;
  runId: string;
  taskType: "quote" | "order" | "invoice" | "product" | "autonomous";
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
  };
  error?: string;
}

interface AgentRunnerProps {
  agents: AgentRun[];
  onApprove?: (runId: string) => void;
  onReject?: (runId: string) => void;
  onCancel?: (runId: string) => void;
  onRemove?: (runId: string) => void;
}

const statusColorMap: Record<AgentStatus, string> = {
  pending: "gray",
  processing: "blue",
  "awaiting-approval": "orange",
  approved: "success",
  rejected: "red",
  completed: "success",
  failed: "red",
};

function formatRelativeTime(date: Date, locale: string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSec < 60) {
    return rtf.format(-diffSec, "second");
  } else if (diffMin < 60) {
    return rtf.format(-diffMin, "minute");
  } else if (diffHour < 24) {
    return rtf.format(-diffHour, "hour");
  } else {
    return rtf.format(-diffDay, "day");
  }
}

function formatTimeLeft(
  seconds: number,
  t: ReturnType<typeof useT>["t"],
): string {
  if (seconds < 60) {
    return t("agents.timeLeft.seconds", {
      defaultValue: "{{count}}s",
      count: seconds,
    });
  }
  const minutes = Math.ceil(seconds / 60);
  return t("agents.timeLeft.minutes", {
    defaultValue: "{{count}}min",
    count: minutes,
  });
}

export function AgentRunner({
  agents,
  onApprove,
  onReject,
  onCancel,
  onRemove,
}: AgentRunnerProps) {
  const { t, i18n } = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (agents.length === 0) {
    return null;
  }

  return (
    <Card.Root variant="outline" size="sm">
      <Card.Header py={2} px={3}>
        <HStack justify="space-between">
          <HStack gap={2}>
            <MaterialSymbol>automation</MaterialSymbol>
            <Text fontWeight="medium" fontSize="sm">
              {t("agents.title", { defaultValue: "AI Agents" })}
            </Text>
            <Box
              bg="primary.500"
              color="white"
              borderRadius="full"
              px={2}
              py={0.5}
              fontSize="xs"
              fontWeight="bold"
            >
              {agents.length}
            </Box>
          </HStack>
        </HStack>
      </Card.Header>
      <Card.Body p={0}>
        <VStack
          gap={0}
          align="stretch"
          separator={<Box borderBottomWidth="1px" />}
        >
          {agents.map((agent) => (
            <AgentRunItem
              key={agent.id}
              agent={agent}
              expanded={expanded[agent.id] ?? false}
              onToggle={() => toggleExpanded(agent.id)}
              onApprove={onApprove}
              onReject={onReject}
              onCancel={onCancel}
              onRemove={onRemove}
              t={t}
              i18n={i18n}
            />
          ))}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

interface AgentRunItemProps {
  agent: AgentRun;
  expanded: boolean;
  onToggle: () => void;
  onApprove?: (runId: string) => void;
  onReject?: (runId: string) => void;
  onCancel?: (runId: string) => void;
  onRemove?: (runId: string) => void;
  t: ReturnType<typeof useT>["t"];
  i18n: ReturnType<typeof useT>["i18n"];
}

function AgentRunItem({
  agent,
  expanded,
  onToggle,
  onApprove,
  onReject,
  onCancel,
  onRemove,
  t,
  i18n,
}: AgentRunItemProps) {
  const isProcessing =
    agent.status === "processing" || agent.status === "pending";
  const isAwaitingApproval = agent.status === "awaiting-approval";
  const isActive = isProcessing || isAwaitingApproval;

  return (
    <Box px={3} py={2}>
      <HStack gap={3}>
        {/* Status indicator */}
        {isProcessing ? (
          <ProgressCircle.Root size="sm" value={agent.progress ?? null}>
            <ProgressCircle.Circle>
              <ProgressCircle.Track />
              <ProgressCircle.Range strokeLinecap="round" stroke="orange.500" />
            </ProgressCircle.Circle>
          </ProgressCircle.Root>
        ) : (
          <Status.Root size="md" colorPalette={statusColorMap[agent.status]}>
            <Status.Indicator />
          </Status.Root>
        )}

        {/* Main content */}
        <VStack align="start" gap={0.5} flex={1} minW={0}>
          <HStack gap={2} w="full">
            <Text fontSize="sm" fontWeight="medium" lineClamp={1} flex={1}>
              {t(`agents.taskType.${agent.taskType}`, {
                defaultValue: agent.taskType,
              })}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              {formatRelativeTime(
                agent.createdAt,
                i18n.resolvedLanguage ?? "en",
              )}
            </Text>
          </HStack>

          {/* Progress bar for processing agents */}
          {isProcessing && typeof agent.progress === "number" && (
            <Progress.Root size="xs" value={agent.progress} w="full">
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
          )}

          {/* Current step or prompt preview */}
          <Text fontSize="xs" color="fg.muted" lineClamp={1}>
            {agent.currentStep ?? agent.prompt}
          </Text>

          {/* Time estimate */}
          {isProcessing && agent.estimatedTimeLeft && (
            <Text fontSize="xs" color="fg.muted">
              {t("agents.estimatedTime", {
                defaultValue: "~{{time}} remaining",
                time: formatTimeLeft(agent.estimatedTimeLeft, t),
              })}
            </Text>
          )}
        </VStack>

        {/* Actions */}
        <HStack gap={1}>
          {isAwaitingApproval && (
            <>
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="success"
                onClick={() => onApprove?.(agent.runId)}
                aria-label={t("agents.approve", { defaultValue: "Approve" })}
              >
                <MaterialSymbol>check</MaterialSymbol>
              </IconButton>
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => onReject?.(agent.runId)}
                aria-label={t("agents.reject", { defaultValue: "Reject" })}
              >
                <MaterialSymbol>close</MaterialSymbol>
              </IconButton>
            </>
          )}

          {isActive && (
            <IconButton
              size="xs"
              variant="ghost"
              colorPalette="gray"
              onClick={() => onCancel?.(agent.runId)}
              aria-label={t("agents.cancel", { defaultValue: "Cancel" })}
            >
              <MaterialSymbol>stop</MaterialSymbol>
            </IconButton>
          )}

          <IconButton
            size="xs"
            variant="ghost"
            colorPalette="gray"
            onClick={() => onRemove?.(agent.runId)}
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
            size="xs"
            variant="ghost"
            onClick={onToggle}
            aria-label={
              expanded
                ? t("agents.collapse", { defaultValue: "Collapse" })
                : t("agents.expand", { defaultValue: "Expand" })
            }
          >
            <MaterialSymbol>
              {expanded ? "expand_less" : "expand_more"}
            </MaterialSymbol>
          </IconButton>
        </HStack>
      </HStack>

      {/* Expanded details */}
      <Collapsible.Root open={expanded}>
        <Collapsible.Content>
          <Box mt={2} pl={8}>
            <VStack align="start" gap={2}>
              <Text fontSize="xs" color="fg.muted">
                <Text as="span" fontWeight="medium">
                  {t("agents.prompt", { defaultValue: "Prompt" })}:
                </Text>{" "}
                {agent.prompt}
              </Text>

              {agent.result && (
                <VStack align="start" gap={1}>
                  {agent.result.customer && (
                    <Text fontSize="xs">
                      <Text as="span" fontWeight="medium">
                        {t("agents.customer", { defaultValue: "Customer" })}:
                      </Text>{" "}
                      {agent.result.customer}
                    </Text>
                  )}
                  {agent.result.itemCount !== undefined && (
                    <Text fontSize="xs">
                      <Text as="span" fontWeight="medium">
                        {t("agents.items", { defaultValue: "Items" })}:
                      </Text>{" "}
                      {agent.result.itemCount}
                    </Text>
                  )}
                  {agent.result.totalPrice !== undefined && (
                    <Text fontSize="xs">
                      <Text as="span" fontWeight="medium">
                        {t("agents.totalPrice", { defaultValue: "Total" })}:
                      </Text>{" "}
                      {new Intl.NumberFormat(i18n.resolvedLanguage, {
                        style: "currency",
                        currency: "PLN",
                      }).format(agent.result.totalPrice)}
                    </Text>
                  )}
                </VStack>
              )}

              {agent.error && (
                <Text fontSize="xs" color="red.500">
                  <Text as="span" fontWeight="medium">
                    {t("agents.error", { defaultValue: "Error" })}:
                  </Text>{" "}
                  {agent.error}
                </Text>
              )}

              {isAwaitingApproval && (
                <HStack gap={2} mt={2}>
                  <Button
                    size="xs"
                    colorPalette="success"
                    onClick={() => onApprove?.(agent.runId)}
                  >
                    <MaterialSymbol>check</MaterialSymbol>
                    {t("agents.approveQuote", {
                      defaultValue: "Approve Quote",
                    })}
                  </Button>
                  <Button
                    size="xs"
                    colorPalette="red"
                    variant="outline"
                    onClick={() => onReject?.(agent.runId)}
                  >
                    <MaterialSymbol>close</MaterialSymbol>
                    {t("agents.rejectQuote", { defaultValue: "Reject" })}
                  </Button>
                </HStack>
              )}
            </VStack>
          </Box>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}

export default AgentRunner;
