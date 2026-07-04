"use client";

import { useT } from "@/i18n/client";
import type { AgentMemoryStatus, AgentMemoryView } from "@konfi/types";
import {
  Badge,
  Button,
  Card,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, Tooltip } from "@konfi/components";

function getStatusPalette(status: AgentMemoryStatus) {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "orange";
    case "rejected":
      return "red";
    case "archived":
      return "gray";
  }
}

function formatDate(value: string | null, language: string | undefined) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatScope(memory: AgentMemoryView) {
  const metadata = memory.scopeMetadata;

  if (memory.scope === "channel" && metadata.channelId) {
    return `${memory.scope}:${metadata.channelId}`;
  }
  if (memory.scope === "customer" && metadata.customerId) {
    return `${memory.scope}:${metadata.customerId}`;
  }
  if (memory.scope === "order" && metadata.orderId) {
    return `${memory.scope}:${metadata.orderId}`;
  }
  if (memory.scope === "product" && metadata.productId) {
    return `${memory.scope}:${metadata.productId}`;
  }
  if (memory.scope === "quote" && metadata.quoteId) {
    return `${memory.scope}:${metadata.quoteId}`;
  }

  return memory.scope;
}

export function AgentMemoryCard({
  memory,
  mutating,
  onApprove,
  onArchive,
  onEdit,
  onReject,
  onReview,
}: {
  memory: AgentMemoryView;
  mutating: boolean;
  onApprove: (memory: AgentMemoryView) => void;
  onArchive: (memory: AgentMemoryView) => void;
  onEdit: (memory: AgentMemoryView) => void;
  onReject: (memory: AgentMemoryView) => void;
  onReview: (memory: AgentMemoryView) => void;
}) {
  const { t, i18n } = useT();
  const language = i18n.resolvedLanguage;
  const statusLabel = t(`agentMemory.statuses.${memory.status}`, {
    defaultValue: memory.status,
  });

  return (
    <Card.Root variant="outline" borderRadius="md">
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <HStack justify="space-between" align="flex-start" gap={3}>
            <HStack gap={2} flexWrap="wrap">
              <Badge colorPalette={getStatusPalette(memory.status)}>
                {statusLabel}
              </Badge>
              <Badge variant="surface">
                {t(`agentMemory.types.${memory.type}`, {
                  defaultValue: memory.type,
                })}
              </Badge>
              <Badge variant="outline">{formatScope(memory)}</Badge>
            </HStack>
            <HStack gap={1}>
              {memory.status === "pending" && (
                <>
                  <Tooltip
                    content={t("agentMemory.actions.review", {
                      defaultValue: "Review",
                    })}
                  >
                    <IconButton
                      size="sm"
                      variant="ghost"
                      aria-label={t("agentMemory.actions.review", {
                        defaultValue: "Review",
                      })}
                      onClick={() => onReview(memory)}
                      disabled={mutating}
                    >
                      <MaterialSymbol>rate_review</MaterialSymbol>
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    content={t("agentMemory.actions.approve", {
                      defaultValue: "Approve",
                    })}
                  >
                    <IconButton
                      size="sm"
                      variant="ghost"
                      colorPalette="success"
                      aria-label={t("agentMemory.actions.approve", {
                        defaultValue: "Approve",
                      })}
                      onClick={() => onApprove(memory)}
                      loading={mutating}
                    >
                      <MaterialSymbol>check</MaterialSymbol>
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    content={t("agentMemory.actions.reject", {
                      defaultValue: "Reject",
                    })}
                  >
                    <IconButton
                      size="sm"
                      variant="ghost"
                      colorPalette="red"
                      aria-label={t("agentMemory.actions.reject", {
                        defaultValue: "Reject",
                      })}
                      onClick={() => onReject(memory)}
                      loading={mutating}
                    >
                      <MaterialSymbol>close</MaterialSymbol>
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    content={t("agentMemory.actions.archive", {
                      defaultValue: "Archive",
                    })}
                  >
                    <IconButton
                      size="sm"
                      variant="ghost"
                      colorPalette="red"
                      aria-label={t("agentMemory.actions.archive", {
                        defaultValue: "Archive",
                      })}
                      onClick={() => onArchive(memory)}
                      loading={mutating}
                    >
                      <MaterialSymbol>archive</MaterialSymbol>
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {memory.status === "active" && (
                <>
                  <Tooltip
                    content={t("agentMemory.actions.edit", {
                      defaultValue: "Edit",
                    })}
                  >
                    <IconButton
                      size="sm"
                      variant="ghost"
                      aria-label={t("agentMemory.actions.edit", {
                        defaultValue: "Edit",
                      })}
                      onClick={() => onEdit(memory)}
                      disabled={mutating}
                    >
                      <MaterialSymbol>edit</MaterialSymbol>
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    content={t("agentMemory.actions.archive", {
                      defaultValue: "Archive",
                    })}
                  >
                    <IconButton
                      size="sm"
                      variant="ghost"
                      colorPalette="red"
                      aria-label={t("agentMemory.actions.archive", {
                        defaultValue: "Archive",
                      })}
                      onClick={() => onArchive(memory)}
                      loading={mutating}
                    >
                      <MaterialSymbol>archive</MaterialSymbol>
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </HStack>
          </HStack>

          <Text whiteSpace="pre-wrap">{memory.content}</Text>

          {memory.rationale && (
            <Text color="fg.muted" fontSize="sm" whiteSpace="pre-wrap">
              {memory.rationale}
            </Text>
          )}

          <HStack gap={2} flexWrap="wrap">
            {memory.taskTypes.map((taskType) => (
              <Badge key={taskType} variant="subtle">
                {t(`agentMemory.taskTypes.${taskType}`, {
                  defaultValue: taskType,
                })}
              </Badge>
            ))}
          </HStack>

          <HStack
            justify="space-between"
            color="fg.muted"
            fontSize="xs"
            gap={3}
            flexWrap="wrap"
          >
            <Text>
              {t("agentMemory.card.updated", {
                defaultValue: "Updated {{date}} by {{name}}",
                date: formatDate(memory.updatedAt, language),
                name: memory.updatedBy.name,
              })}
            </Text>
            {memory.sourceRun && (
              <Button
                size="xs"
                variant="plain"
                px={0}
                disabled
                color="fg.muted"
              >
                <MaterialSymbol>account_tree</MaterialSymbol>
                {t("agentMemory.card.sourceRun", {
                  defaultValue: "Run {{runId}}",
                  runId: memory.sourceRun.runId,
                })}
              </Button>
            )}
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
