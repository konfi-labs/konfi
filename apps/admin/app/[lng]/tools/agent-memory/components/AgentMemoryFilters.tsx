"use client";

import { useT } from "@/i18n/client";
import {
  AGENT_MEMORY_STATUSES,
  AGENT_TASK_TYPES,
  type AgentMemoryStatus,
} from "@konfi/types";
import { createListCollection, Portal, Select } from "@chakra-ui/react";
import { useMemo } from "react";
import type { MemoryTaskType } from "./agent-memory-form-state";

export type StatusFilter = AgentMemoryStatus | "all";
export type TaskTypeFilter = MemoryTaskType | "all";

const MEMORY_TASK_TYPES = AGENT_TASK_TYPES.filter(
  (taskType): taskType is MemoryTaskType => taskType !== "invoice",
);

export function AgentMemoryFilters({
  statusFilter,
  taskTypeFilter,
  onStatusFilterChange,
  onTaskTypeFilterChange,
}: {
  statusFilter: StatusFilter;
  taskTypeFilter: TaskTypeFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  onTaskTypeFilterChange: (value: TaskTypeFilter) => void;
}) {
  const { t } = useT();
  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("agentMemory.filters.allStatuses", {
              defaultValue: "All statuses",
            }),
            value: "all",
          },
          ...AGENT_MEMORY_STATUSES.map((status) => ({
            label: t(`agentMemory.statuses.${status}`, {
              defaultValue: status,
            }),
            value: status,
          })),
        ],
      }),
    [t],
  );
  const taskTypeCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("agentMemory.filters.allTaskTypes", {
              defaultValue: "All task types",
            }),
            value: "all",
          },
          ...MEMORY_TASK_TYPES.map((taskType) => ({
            label: t(`agentMemory.taskTypes.${taskType}`, {
              defaultValue: taskType,
            }),
            value: taskType,
          })),
        ],
      }),
    [t],
  );

  return (
    <>
      <Select.Root
        collection={statusCollection}
        value={[statusFilter]}
        onValueChange={({ value }) =>
          onStatusFilterChange((value[0] as StatusFilter | undefined) ?? "all")
        }
        size="sm"
        width="180px"
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText
              placeholder={t("agentMemory.filters.status", {
                defaultValue: "Status",
              })}
            />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {statusCollection.items.map((item) => (
                <Select.Item item={item} key={item.value}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>

      <Select.Root
        collection={taskTypeCollection}
        value={[taskTypeFilter]}
        onValueChange={({ value }) =>
          onTaskTypeFilterChange(
            (value[0] as TaskTypeFilter | undefined) ?? "all",
          )
        }
        size="sm"
        width="200px"
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText
              placeholder={t("agentMemory.filters.taskType", {
                defaultValue: "Task type",
              })}
            />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content>
              {taskTypeCollection.items.map((item) => (
                <Select.Item item={item} key={item.value}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>
    </>
  );
}
