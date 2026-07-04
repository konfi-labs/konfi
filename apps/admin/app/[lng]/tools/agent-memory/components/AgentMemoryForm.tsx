"use client";

import { useT } from "@/i18n/client";
import {
  AGENT_MEMORY_SCOPES,
  AGENT_MEMORY_TYPES,
  AGENT_TASK_TYPES,
  type AgentMemoryScope,
  type AgentMemoryType,
} from "@konfi/types";
import {
  Checkbox,
  createListCollection,
  Field,
  Grid,
  HStack,
  Input,
  Portal,
  Select,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { useMemo, type ChangeEvent } from "react";
import {
  SCOPE_METADATA_FIELD,
  type AgentMemoryFormState,
  type AgentMemoryTextFormKey,
  type MemoryTaskType,
} from "./agent-memory-form-state";

const MEMORY_TASK_TYPES = AGENT_TASK_TYPES.filter(
  (taskType): taskType is MemoryTaskType => taskType !== "invoice",
);

export function AgentMemoryForm({
  state,
  onChange,
}: {
  state: AgentMemoryFormState;
  onChange: (state: AgentMemoryFormState) => void;
}) {
  const { t } = useT();

  const typeCollection = useMemo(
    () =>
      createListCollection({
        items: AGENT_MEMORY_TYPES.map((type) => ({
          label: t(`agentMemory.types.${type}`, { defaultValue: type }),
          value: type,
        })),
      }),
    [t],
  );
  const scopeCollection = useMemo(
    () =>
      createListCollection({
        items: AGENT_MEMORY_SCOPES.map((scope) => ({
          label: t(`agentMemory.scopes.${scope}`, { defaultValue: scope }),
          value: scope,
        })),
      }),
    [t],
  );
  const visibleScopeField =
    state.scope === "tenant" ? undefined : SCOPE_METADATA_FIELD[state.scope];

  const updateText =
    (key: AgentMemoryTextFormKey) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({ ...state, [key]: event.target.value });
    };

  const toggleTaskType = (taskType: MemoryTaskType, checked: boolean) => {
    const nextTaskTypes = checked
      ? [...new Set([...state.taskTypes, taskType])]
      : state.taskTypes.filter((item) => item !== taskType);
    onChange({ ...state, taskTypes: nextTaskTypes });
  };

  return (
    <VStack align="stretch" gap={4}>
      <Field.Root required>
        <Field.Label>
          {t("agentMemory.form.content", { defaultValue: "Memory content" })}
          <Field.RequiredIndicator />
        </Field.Label>
        <Textarea
          minH="120px"
          value={state.content}
          onChange={updateText("content")}
          placeholder={t("agentMemory.form.contentPlaceholder", {
            defaultValue:
              "Use matte paper by default for ACME repeat quote requests unless the customer asks otherwise.",
          })}
        />
        <Field.HelperText>
          {t("agentMemory.form.contentHelp", {
            defaultValue:
              "Store future-useful facts or instructions only after they are reviewed.",
          })}
        </Field.HelperText>
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("agentMemory.form.rationale", { defaultValue: "Rationale" })}
        </Field.Label>
        <Textarea
          minH="80px"
          value={state.rationale}
          onChange={updateText("rationale")}
          placeholder={t("agentMemory.form.rationalePlaceholder", {
            defaultValue: "Why should future agent runs receive this context?",
          })}
        />
      </Field.Root>

      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
        <Field.Root required>
          <Field.Label>
            {t("agentMemory.form.type", { defaultValue: "Type" })}
            <Field.RequiredIndicator />
          </Field.Label>
          <Select.Root
            collection={typeCollection}
            value={[state.type]}
            onValueChange={({ value }) => {
              const next = value[0] as AgentMemoryType | undefined;
              if (next) onChange({ ...state, type: next });
            }}
          >
            <Select.HiddenSelect />
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content>
                  {typeCollection.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                      {item.label}
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </Field.Root>

        <Field.Root required>
          <Field.Label>
            {t("agentMemory.form.scope", { defaultValue: "Scope" })}
            <Field.RequiredIndicator />
          </Field.Label>
          <Select.Root
            collection={scopeCollection}
            value={[state.scope]}
            onValueChange={({ value }) => {
              const next = value[0] as AgentMemoryScope | undefined;
              if (next) onChange({ ...state, scope: next });
            }}
          >
            <Select.HiddenSelect />
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content>
                  {scopeCollection.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                      {item.label}
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </Field.Root>
      </Grid>

      {visibleScopeField && (
        <Field.Root required>
          <Field.Label>
            {t(`agentMemory.form.${visibleScopeField}`, {
              defaultValue: "Scope ID",
            })}
            <Field.RequiredIndicator />
          </Field.Label>
          <Input
            value={state[visibleScopeField]}
            onChange={updateText(visibleScopeField)}
            placeholder={t(`agentMemory.form.${visibleScopeField}Placeholder`, {
              defaultValue: "Enter the related record ID",
            })}
          />
        </Field.Root>
      )}

      <Field.Root required>
        <Field.Label>
          {t("agentMemory.form.taskTypes", { defaultValue: "Agent tasks" })}
          <Field.RequiredIndicator />
        </Field.Label>
        <HStack gap={4} flexWrap="wrap">
          {MEMORY_TASK_TYPES.map((taskType) => (
            <Checkbox.Root
              key={taskType}
              checked={state.taskTypes.includes(taskType)}
              onCheckedChange={(details) =>
                toggleTaskType(taskType, details.checked === true)
              }
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>
                {t(`agentMemory.taskTypes.${taskType}`, {
                  defaultValue: taskType,
                })}
              </Checkbox.Label>
            </Checkbox.Root>
          ))}
        </HStack>
        <Field.HelperText>
          <Text as="span">
            {t("agentMemory.form.taskTypesHelp", {
              defaultValue:
                "Approved memory is only injected into the selected task types.",
            })}
          </Text>
        </Field.HelperText>
      </Field.Root>
    </VStack>
  );
}
