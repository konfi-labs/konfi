"use client";

import { useT } from "@/i18n/client";
import {
  Button,
  Combobox,
  Dialog,
  Portal,
  Text,
  useFilter,
  useListCollection,
  VStack,
} from "@chakra-ui/react";
import type { Member, NestedMember } from "@konfi/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type MemberOption = {
  label: string;
  member: NestedMember;
  value: string;
};

type StatusActorSelectionDialogProps = {
  members: Member[] | null | undefined;
  onConfirm: (member: NestedMember) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function toMemberOption(member: Member): MemberOption | null {
  const id = member.id.trim();
  const name = member.name.trim();

  if (!id || !name) {
    return null;
  }

  return {
    label: name,
    member: { id, name },
    value: id,
  };
}

export function StatusActorSelectionDialog({
  members,
  onConfirm,
  onOpenChange,
  open,
}: StatusActorSelectionDialogProps) {
  const { t } = useT(["orders", "translation"]);
  const { contains } = useFilter({ sensitivity: "base" });
  const [inputValue, setInputValue] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const memberOptions = useMemo(
    () =>
      (members ?? [])
        .map(toMemberOption)
        .filter((option): option is MemberOption => Boolean(option)),
    [members],
  );
  const { collection, filter, reset, set } = useListCollection<MemberOption>({
    initialItems: memberOptions,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
    filter: contains,
  });
  const resetOptionFilter = useCallback(() => {
    reset();
  }, [reset]);
  const selectedMember = selectedMemberId
    ? memberOptions.find((option) => option.value === selectedMemberId)?.member
    : undefined;

  useEffect(() => {
    set(memberOptions);
    filter(inputValue);
  }, [filter, inputValue, memberOptions, set]);

  useEffect(() => {
    if (open) {
      return;
    }

    setInputValue("");
    setSelectedMemberId(null);
    resetOptionFilter();
  }, [open, resetOptionFilter]);

  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      onOpenChange={({ open: nextOpen }) => onOpenChange(nextOpen)}
      lazyMount
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("orders.statusActorSelectionTitle", {
                  defaultValue: "Assign a team member",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Text>
                  {t("orders.statusActorSelectionDescription", {
                    defaultValue:
                      "This store order was created and last updated by System. Select the team member responsible for this status change.",
                  })}
                </Text>
                <VStack align="stretch" gap={2}>
                  <Text as="label" fontSize="sm" fontWeight="medium">
                    {t("orders.statusActorSelectionMemberLabel", {
                      defaultValue: "Team member",
                    })}
                  </Text>
                  <Combobox.Root
                    collection={collection}
                    inputValue={inputValue}
                    value={selectedMemberId ? [selectedMemberId] : []}
                    onValueChange={({ value }) => {
                      const nextMemberId = value[0];

                      if (!nextMemberId) {
                        setInputValue("");
                        setSelectedMemberId(null);
                        resetOptionFilter();
                        return;
                      }

                      const option = memberOptions.find(
                        (memberOption) => memberOption.value === nextMemberId,
                      );

                      if (!option) {
                        return;
                      }

                      setInputValue(option.label);
                      setSelectedMemberId(option.value);
                      resetOptionFilter();
                    }}
                    onInputValueChange={({ inputValue: nextInputValue }) => {
                      const nextValue = nextInputValue ?? "";
                      setInputValue(nextValue);
                      filter(nextValue);
                    }}
                    disabled={memberOptions.length === 0}
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
                    <Combobox.Control width="100%">
                      <Combobox.Input
                        placeholder={t(
                          "orders.statusActorSelectionPlaceholder",
                          {
                            defaultValue: "Select team member",
                          },
                        )}
                      />
                      <Combobox.IndicatorGroup>
                        <Combobox.Trigger />
                      </Combobox.IndicatorGroup>
                    </Combobox.Control>
                    <Portal>
                      <Combobox.Positioner>
                        <Combobox.Content minW="var(--reference-width)">
                          <Combobox.Empty>
                            {t("orders.statusActorSelectionNoMembers", {
                              defaultValue: "No team members available",
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
                </VStack>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t("orders.cancel", { defaultValue: "Cancel" })}
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="primary"
                disabled={!selectedMember}
                onClick={() => {
                  if (!selectedMember) {
                    return;
                  }

                  onConfirm(selectedMember);
                }}
              >
                {t("orders.changeStatus", {
                  defaultValue: "Change status",
                })}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
