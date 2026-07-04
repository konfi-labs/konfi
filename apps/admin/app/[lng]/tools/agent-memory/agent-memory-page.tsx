"use client";

import { useChannels } from "@/context/channels";
import { useT } from "@/i18n/client";
import type { AgentMemoryView } from "@konfi/types";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Separator,
  Spacer,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Empty,
  MaterialSymbol,
  SearchInput,
  toaster,
} from "@konfi/components";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import { AgentMemoryCard } from "./components/AgentMemoryCard";
import {
  AgentMemoryDialog,
  type AgentMemoryDialogMode,
} from "./components/AgentMemoryDialog";
import {
  AgentMemoryFilters,
  type StatusFilter,
  type TaskTypeFilter,
} from "./components/AgentMemoryFilters";
import {
  buildAgentMemoryPayload,
  createAgentMemoryFormState,
  createAgentMemoryFormStateFromMemory,
  isAgentMemoryFormSubmittable,
  type AgentMemoryFormState,
} from "./components/agent-memory-form-state";

interface AgentMemoryListResponse {
  memories: AgentMemoryView[];
}

interface AgentMemoryMutationResponse {
  memory: AgentMemoryView;
}

interface MemoryDialogState {
  memory?: AgentMemoryView;
  mode: AgentMemoryDialogMode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getApiError(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  return typeof value.error === "string" ? value.error : undefined;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(getApiError(payload) ?? "Request failed");
  }

  return payload as T;
}

async function fetchAgentMemories(url: string) {
  const response = await fetch(url);
  return readJsonResponse<AgentMemoryListResponse>(response);
}

async function mutateAgentMemory(
  memoryId: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`/api/agent-memory/${memoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return readJsonResponse<AgentMemoryMutationResponse>(response);
}

async function createAgentMemory(payload: Record<string, unknown>) {
  const response = await fetch("/api/agent-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return readJsonResponse<AgentMemoryMutationResponse>(response);
}

export default function AgentMemoryPage() {
  const { t } = useT();
  const { channel } = useChannels();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskTypeFilter>("all");
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<MemoryDialogState | null>(null);
  const [formState, setFormState] = useState<AgentMemoryFormState>(() =>
    createAgentMemoryFormState(channel?.id),
  );
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const memoryUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (taskTypeFilter !== "all") params.set("taskType", taskTypeFilter);
    if (searchKey && searchKey.trim()) params.set("query", searchKey.trim());

    return `/api/agent-memory?${params.toString()}`;
  }, [searchKey, statusFilter, taskTypeFilter]);
  const { data, error, isLoading, mutate } = useSWR(
    memoryUrl,
    fetchAgentMemories,
  );
  const memories = data?.memories ?? [];
  const pendingCount = memories.filter(
    (memory) => memory.status === "pending",
  ).length;
  const activeCount = memories.filter(
    (memory) => memory.status === "active",
  ).length;

  const closeDialog = useCallback(() => {
    setDialog(null);
    setFormState(createAgentMemoryFormState(channel?.id));
  }, [channel?.id]);

  const openCreateDialog = () => {
    setDialog({ mode: "create" });
    setFormState(createAgentMemoryFormState(channel?.id));
  };

  const openMemoryDialog = (
    memory: AgentMemoryView,
    mode: AgentMemoryDialogMode,
  ) => {
    setDialog({ memory, mode });
    setFormState(createAgentMemoryFormStateFromMemory(memory));
  };

  const handleMutation = useCallback(
    async (
      memory: AgentMemoryView,
      payload: Record<string, unknown>,
      successKey: string,
      successDefaultValue: string,
    ) => {
      setMutatingId(memory.id);
      try {
        await mutateAgentMemory(memory.id, payload);
        toaster.success({
          title: t(successKey, { defaultValue: successDefaultValue }),
        });
        await mutate();
      } catch (mutationError) {
        toaster.error({
          title: t("agentMemory.toast.errorTitle", {
            defaultValue: "Memory was not saved",
          }),
          description:
            mutationError instanceof Error
              ? mutationError.message
              : t("agentMemory.toast.errorDescription", {
                  defaultValue: "Check the memory and try again.",
                }),
        });
      } finally {
        setMutatingId(null);
      }
    },
    [mutate, t],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || !isAgentMemoryFormSubmittable(formState)) return;

    setIsSubmitting(true);
    try {
      if (dialog.mode === "create") {
        await createAgentMemory(buildAgentMemoryPayload(formState));
        toaster.success({
          title: t("agentMemory.toast.created", {
            defaultValue: "Memory created",
          }),
        });
      } else if (dialog.memory) {
        await mutateAgentMemory(dialog.memory.id, {
          action: dialog.mode === "review" ? "approve" : "update",
          ...buildAgentMemoryPayload(formState),
        });
        toaster.success({
          title: t(
            dialog.mode === "review"
              ? "agentMemory.toast.approved"
              : "agentMemory.toast.updated",
            {
              defaultValue:
                dialog.mode === "review" ? "Memory approved" : "Memory updated",
            },
          ),
        });
      }

      closeDialog();
      await mutate();
    } catch (submitError) {
      toaster.error({
        title: t("agentMemory.toast.errorTitle", {
          defaultValue: "Memory was not saved",
        }),
        description:
          submitError instanceof Error
            ? submitError.message
            : t("agentMemory.toast.errorDescription", {
                defaultValue: "Check the memory and try again.",
              }),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CustomHeading
        heading={t("agentMemory.title", { defaultValue: "Agent Memory" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex gap={2} flexWrap="wrap" alignItems="center">
        <SearchInput
          placeholder={t("agentMemory.filters.queryPlaceholder", {
            defaultValue: "Search content, rationale, or source prompt",
          })}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          searchMode="debounced"
          t={t}
        />
        <AgentMemoryFilters
          statusFilter={statusFilter}
          taskTypeFilter={taskTypeFilter}
          onStatusFilterChange={setStatusFilter}
          onTaskTypeFilterChange={setTaskTypeFilter}
        />
        <Spacer />
        <Button
          variant={"solid"}
          colorPalette={"primary"}
          onClick={openCreateDialog}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("agentMemory.actions.create", { defaultValue: "Create" })}
        </Button>
      </Flex>
      <Separator my={"6"} />

      <HStack gap={2} mb={4} flexWrap="wrap">
        <Badge variant="subtle">
          {t("agentMemory.summary.total", {
            defaultValue: "{{count}} memories",
            count: memories.length,
          })}
        </Badge>
        <Badge variant="subtle" colorPalette="orange">
          {t("agentMemory.summary.pending", {
            defaultValue: "{{count}} pending",
            count: pendingCount,
          })}
        </Badge>
        <Badge variant="subtle" colorPalette="success">
          {t("agentMemory.summary.active", {
            defaultValue: "{{count}} active",
            count: activeCount,
          })}
        </Badge>
      </HStack>

      {isLoading ? (
        <HStack justify="center" py={10}>
          <Spinner />
          <Text color="fg.muted">
            {t("agentMemory.loading", { defaultValue: "Loading memory" })}
          </Text>
        </HStack>
      ) : error ? (
        <Box borderWidth="1px" borderRadius="md" p={6}>
          <Text color="fg.error">
            {error instanceof Error
              ? error.message
              : t("agentMemory.loadError", {
                  defaultValue: "Memory could not be loaded.",
                })}
          </Text>
        </Box>
      ) : memories.length === 0 ? (
        <Empty
          title={t("agentMemory.empty.title", {
            defaultValue: "No memory matches these filters",
          })}
          description={t("agentMemory.empty.description", {
            defaultValue:
              "Approved memories and pending proposals will appear here after agents or admins create them.",
          })}
          icon={"psychology_alt"}
        />
      ) : (
        <VStack align="stretch" gap={3}>
          {memories.map((memory) => (
            <AgentMemoryCard
              key={memory.id}
              memory={memory}
              mutating={mutatingId === memory.id}
              onApprove={(item) =>
                handleMutation(
                  item,
                  { action: "approve" },
                  "agentMemory.toast.approved",
                  "Memory approved",
                )
              }
              onArchive={(item) =>
                handleMutation(
                  item,
                  { action: "archive" },
                  "agentMemory.toast.archived",
                  "Memory archived",
                )
              }
              onEdit={(item) => openMemoryDialog(item, "edit")}
              onReject={(item) =>
                handleMutation(
                  item,
                  { action: "reject" },
                  "agentMemory.toast.rejected",
                  "Memory rejected",
                )
              }
              onReview={(item) => openMemoryDialog(item, "review")}
            />
          ))}
        </VStack>
      )}

      <AgentMemoryDialog
        formState={formState}
        mode={dialog?.mode ?? null}
        open={dialog !== null}
        submitting={isSubmitting}
        onClose={closeDialog}
        onFormChange={setFormState}
        onSubmit={handleSubmit}
      />
    </>
  );
}
