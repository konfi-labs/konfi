"use client";

import { useConfiguration } from "@/context/configuration";
import { useT } from "@/i18n/client";
import {
  Combobox,
  Portal,
  useFilter,
  useListCollection,
} from "@chakra-ui/react";
import { Field } from "@konfi/components";
import type { NestedMember } from "@konfi/types";
import { suppressMissingOnChangeHandlerWarning } from "@konfi/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

type ByFieldControllerProps = {
  update?: boolean;
  autoAddToCarriedOutBy?: boolean;
};

type MemberOption = {
  label: string;
  value: string;
};

function getCarriedOutByValues(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isNestedMember(value: unknown): value is NestedMember {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

export const By = ({
  update = false,
  autoAddToCarriedOutBy = false,
}: ByFieldControllerProps) => (
  <ByCombobox update={update} autoAddToCarriedOutBy={autoAddToCarriedOutBy} />
);

const ByCombobox = ({
  update = false,
  autoAddToCarriedOutBy = false,
}: ByFieldControllerProps) => {
  const { setValue, control, formState, getFieldState, getValues } =
    useFormContext();
  const { errors } = formState;
  const { loadingMembers, filteredMembers } = useConfiguration();
  const { t } = useT(["orders", "translation"]);
  const fieldName = update ? "updatedBy" : "createdBy";
  const watchedValue = useWatch({
    control,
    name: fieldName,
  });
  const isFieldDirty = getFieldState(fieldName, formState).isDirty;
  const clearedUpdateMemberIdRef = useRef<string | null>(null);
  const selectedUpdateMemberIdRef = useRef<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const addMemberToCarriedOutBy = useCallback(
    (member: NestedMember, shouldDirty: boolean) => {
      if (!autoAddToCarriedOutBy || update) return;

      const memberName = member.name.trim();
      if (!memberName) return;

      const carriedOutBy = getCarriedOutByValues(getValues("carriedOutBy"));
      if (carriedOutBy.includes(memberName)) return;

      setValue("carriedOutBy", [...carriedOutBy, memberName], {
        shouldDirty,
        shouldTouch: shouldDirty,
        shouldValidate: true,
      });
    },
    [autoAddToCarriedOutBy, getValues, setValue, update],
  );

  // Filter hook for search functionality
  const { contains } = useFilter({ sensitivity: "base" });

  // Create member options for filtering
  const memberOptions = useMemo<MemberOption[]>(
    () =>
      (filteredMembers ?? []).map((member) => ({
        label: member.name,
        value: member.id,
      })),
    [filteredMembers],
  );

  // Use list collection with filtering
  const { collection, set, filter, reset } = useListCollection<MemberOption>({
    initialItems: memberOptions,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
    filter: contains,
  });

  const resetOptionFilter = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    set(memberOptions);
  }, [memberOptions, set]);

  useEffect(() => {
    if (
      watchedValue &&
      typeof watchedValue === "object" &&
      "name" in watchedValue &&
      typeof watchedValue.name === "string"
    ) {
      setInputValue(watchedValue.name);
      return;
    }

    setInputValue("");
  }, [watchedValue]);

  useEffect(() => {
    if (isNestedMember(watchedValue)) {
      addMemberToCarriedOutBy(watchedValue, false);
    }
  }, [addMemberToCarriedOutBy, watchedValue]);

  useEffect(() => {
    if (!update) {
      clearedUpdateMemberIdRef.current = null;
      selectedUpdateMemberIdRef.current = null;
      return;
    }

    if (isFieldDirty) {
      selectedUpdateMemberIdRef.current = null;
      return;
    }

    if (
      watchedValue &&
      typeof watchedValue === "object" &&
      "id" in watchedValue &&
      typeof watchedValue.id === "string" &&
      watchedValue.id.length > 0
    ) {
      if (selectedUpdateMemberIdRef.current === watchedValue.id) {
        return;
      }

      if (clearedUpdateMemberIdRef.current === watchedValue.id) {
        return;
      }

      clearedUpdateMemberIdRef.current = watchedValue.id;
      setValue(
        fieldName,
        { id: "", name: "" },
        {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        },
      );
    }
  }, [fieldName, isFieldDirty, setValue, update, watchedValue]);

  return (
    <Controller
      name={fieldName}
      control={control}
      render={({ field }) => (
        <Field
          mt={4}
          w="100%"
          label={update ? t("orders.updatedBy") : t("orders.createdBy")}
          invalid={!!errors[field.name]}
          errorText={
            errors[update ? "updatedBy" : "createdBy"] &&
            t("common.selectOption")
          }
          required
        >
          <Combobox.Root
            size="sm"
            collection={collection}
            inputValue={inputValue}
            value={(() => {
              if (!field.value) return [];
              if (typeof field.value === "string") {
                return field.value ? [field.value] : [];
              }
              if (typeof field.value === "object" && "id" in field.value) {
                return field.value.id ? [field.value.id as string] : [];
              }
              return [];
            })()}
            onValueChange={({ value: nextValue }) => {
              const selectedId = nextValue[0];
              if (!selectedId) {
                setInputValue("");
                resetOptionFilter();
                return;
              }

              const selectedMember = filteredMembers?.find(
                (member) => member.id === selectedId,
              );
              if (!selectedMember) {
                return;
              }

              if (update) {
                selectedUpdateMemberIdRef.current = selectedMember.id;
              }

              setInputValue(selectedMember.name);
              resetOptionFilter();
              field.onChange(selectedMember);
              setValue(field.name, selectedMember, {
                shouldValidate: true,
                shouldDirty: true,
                shouldTouch: true,
              });
              addMemberToCarriedOutBy(selectedMember, true);
              localStorage.setItem("byField", selectedMember.id);
              field.onBlur();
            }}
            onInputValueChange={(details) => {
              const nextInputValue = details.inputValue ?? "";
              setInputValue(nextInputValue);
              filter(nextInputValue);
            }}
            disabled={loadingMembers || memberOptions.length === 0}
            selectionBehavior="replace"
            openOnClick
            closeOnSelect
            width="100%"
            onOpenChange={({ open }) => {
              if (open) {
                resetOptionFilter();
              }
            }}
          >
            {/* Hidden input for form compatibility */}
            <input
              type="hidden"
              name={field.name}
              value={(() => {
                if (!field.value) return "";
                if (typeof field.value === "string") return field.value;
                if (typeof field.value === "object" && "id" in field.value) {
                  return field.value.id as string;
                }
                return "";
              })()}
              onChange={suppressMissingOnChangeHandlerWarning}
            />
            <Combobox.Control borderRadius="full" minW="150px" width="100%">
              <Combobox.Input
                width="100%"
                placeholder={
                  loadingMembers
                    ? t("common.loading", { defaultValue: "Loading..." })
                    : t("common.selectOption")
                }
              />
              <Combobox.IndicatorGroup>
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content minW="var(--reference-width)">
                  <Combobox.Empty>
                    {t("admin.noTeamMembers", {
                      defaultValue: "No team members",
                    })}
                  </Combobox.Empty>
                  {collection.items.map((item) => (
                    <Combobox.Item key={item.value} item={item}>
                      {item.label}
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  ))}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>
        </Field>
      )}
    />
  );
};
