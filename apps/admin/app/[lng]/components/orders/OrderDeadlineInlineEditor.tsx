"use client";

import {
  Badge,
  Button,
  HStack,
  Popover,
  Portal,
  VStack,
} from "@chakra-ui/react";
import {
  DatePickerInput,
  DeadlineTimeGrid,
  DEFAULT_DEADLINE_TIME,
  getDateTimeInputParts,
  MaterialSymbol,
  Switch,
} from "@konfi/components";
import { Order } from "@konfi/types";
import { getDeadlineColorPalette, timeToDeadline } from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface OrderDeadlineInlineEditorValue {
  deadlineString: string;
  exactTime: boolean;
}

interface OrderDeadlineInlineEditorProps {
  deadline: Order["deadline"];
  deadlineString: string;
  exactTime: boolean;
  priority: Order["priority"];
  onSave: (value: OrderDeadlineInlineEditorValue) => Promise<void>;
  t: TFunction;
  i18n: i18n;
}

function normalizeDeadlineInputValue(value: string, exactTime: boolean) {
  const { date, time } = getDateTimeInputParts(value);

  if (!date) {
    return "";
  }

  if (!exactTime) {
    return date;
  }

  return `${date}T${time || DEFAULT_DEADLINE_TIME}`;
}

function getLocalDeadlineParts(value: string) {
  return getDateTimeInputParts(value);
}

function createDeadlineInputValue(date: string, time: string) {
  if (!date) {
    return "";
  }

  return `${date}T${time || DEFAULT_DEADLINE_TIME}`;
}

export function OrderDeadlineInlineEditor({
  deadline,
  deadlineString,
  exactTime,
  priority,
  onSave,
  t,
  i18n,
}: OrderDeadlineInlineEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localExactTime, setLocalExactTime] = useState(exactTime);
  const [localDeadlineString, setLocalDeadlineString] = useState(
    normalizeDeadlineInputValue(deadlineString, exactTime),
  );

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setLocalExactTime(exactTime);
    setLocalDeadlineString(
      normalizeDeadlineInputValue(deadlineString, exactTime),
    );
  }, [deadlineString, exactTime, isOpen]);

  const daysToDeadline = useMemo(
    () => Number(timeToDeadline(deadline.toDate())),
    [deadline],
  );
  const deadlineColorPalette = useMemo(
    () => getDeadlineColorPalette(deadline.toDate()),
    [deadline],
  );
  const { date: localDeadlineDate, time: localDeadlineTime } = useMemo(
    () => getLocalDeadlineParts(localDeadlineString),
    [localDeadlineString],
  );

  const handleStartEditing = useCallback(() => {
    setIsOpen(true);
    setLocalExactTime(exactTime);
    setLocalDeadlineString(
      normalizeDeadlineInputValue(deadlineString, exactTime),
    );
  }, [deadlineString, exactTime]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    setLocalExactTime(exactTime);
    setLocalDeadlineString(
      normalizeDeadlineInputValue(deadlineString, exactTime),
    );
  }, [deadlineString, exactTime]);

  const handleExactTimeChange = useCallback(
    ({ checked }: { checked: boolean | "indeterminate" }) => {
      const nextExactTime = checked === true;
      setLocalExactTime(nextExactTime);
      setLocalDeadlineString((currentValue) =>
        normalizeDeadlineInputValue(
          currentValue || deadlineString,
          nextExactTime,
        ),
      );
    },
    [deadlineString],
  );

  const handleSave = useCallback(async () => {
    if (!localDeadlineString) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        deadlineString: normalizeDeadlineInputValue(
          localDeadlineString,
          localExactTime,
        ),
        exactTime: localExactTime,
      });
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to save order deadline:", error);
      setLocalExactTime(exactTime);
      setLocalDeadlineString(
        normalizeDeadlineInputValue(deadlineString, exactTime),
      );
    } finally {
      setIsSaving(false);
    }
  }, [deadlineString, exactTime, localDeadlineString, localExactTime, onSave]);

  return (
    <HStack display="inline-flex" flexWrap="wrap" align="center" gap={2}>
      <Popover.Root
        open={isOpen}
        onOpenChange={({ open }) => {
          if (!open) {
            handleCancel();
            return;
          }

          handleStartEditing();
        }}
        positioning={{ placement: "bottom-end", gutter: 8 }}
      >
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            p={0}
            h="auto"
            minH="unset"
            borderRadius="full"
            _hover={{ bg: "transparent", opacity: 0.85 }}
            _active={{ bg: "transparent" }}
            aria-label={t("order.editDeadline", {
              defaultValue: "Edit deadline",
            })}
          >
            <HStack flexWrap="wrap" gap={2} align="center">
              <Badge
                colorPalette={deadlineColorPalette}
                variant={deadlineColorPalette ? "solid" : undefined}
                pl={4}
                pr={4}
                size="lg"
              >
                {t("order.deadline", { defaultValue: "Deadline" })}:{" "}
                {deadline.toDate().toLocaleDateString(i18n.resolvedLanguage, {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: exactTime ? "2-digit" : undefined,
                  minute: exactTime ? "2-digit" : undefined,
                })}
              </Badge>
              {exactTime && (
                <Badge
                  colorPalette={deadlineColorPalette}
                  variant={deadlineColorPalette ? "solid" : "subtle"}
                  pl={4}
                  pr={4}
                  size="lg"
                >
                  {t("order.deliveryTime", {
                    defaultValue: "Delivery time",
                  })}
                  :{" "}
                  {deadline.toDate().toLocaleTimeString(i18n.resolvedLanguage, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Badge>
              )}
              {daysToDeadline > 0 && (
                <Badge pl={3} pr={4} size="lg">
                  <MaterialSymbol>schedule</MaterialSymbol>
                  {t("common.daysWithCount", {
                    defaultValue: "{{count}} days",
                    count: daysToDeadline,
                  })}
                </Badge>
              )}
            </HStack>
          </Button>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content maxW="360px" className="noprint">
              <Popover.Header fontWeight="semibold" fontSize="md">
                {t("order.editDeadline", {
                  defaultValue: "Edit deadline",
                })}
              </Popover.Header>
              <Popover.Body>
                <VStack align="stretch" gap={4}>
                  <Switch
                    checked={localExactTime}
                    onCheckedChange={handleExactTimeChange}
                    justifyContent="space-between"
                  >
                    {t("forms.placeholders.exactTime", {
                      defaultValue: "Exact time of realization",
                    })}
                  </Switch>
                  <DatePickerInput
                    value={localDeadlineString}
                    onValueChange={(nextDate) =>
                      setLocalDeadlineString(
                        localExactTime
                          ? createDeadlineInputValue(
                              nextDate,
                              localDeadlineTime,
                            )
                          : nextDate,
                      )
                    }
                    locale={i18n.resolvedLanguage}
                    closeOnSelect={!localExactTime}
                    format={(selectedDate) =>
                      localExactTime
                        ? `${selectedDate.toString()} ${
                            localDeadlineTime || DEFAULT_DEADLINE_TIME
                          }`
                        : selectedDate.toString()
                    }
                    todayLabel={t("common.todaysDate", {
                      defaultValue: "Today's date",
                    })}
                    triggerLabel={t("order.deadline", {
                      defaultValue: "Deadline",
                    })}
                    inputProps={{
                      "aria-label": t("order.deadline", {
                        defaultValue: "Deadline",
                      }),
                    }}
                    contentEndElement={({ close }) =>
                      localExactTime ? (
                        <DeadlineTimeGrid
                          value={localDeadlineTime}
                          label={t("forms.labels.time", {
                            defaultValue: "Time",
                          })}
                          disabled={!localDeadlineDate}
                          onValueChange={(nextTime) => {
                            setLocalDeadlineString(
                              createDeadlineInputValue(
                                localDeadlineDate,
                                nextTime,
                              ),
                            );
                            close();
                          }}
                        />
                      ) : null
                    }
                  />
                  <HStack gap={2} justify="flex-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      colorPalette="red"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      <MaterialSymbol>close</MaterialSymbol>
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </Button>
                    <Button
                      size="sm"
                      variant="surface"
                      colorPalette="success"
                      onClick={handleSave}
                      disabled={!localDeadlineString || isSaving}
                      loading={isSaving}
                    >
                      <MaterialSymbol>check</MaterialSymbol>
                      {t("common.save", { defaultValue: "Save" })}
                    </Button>
                  </HStack>
                </VStack>
              </Popover.Body>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
      <Badge
        colorPalette={priority === 1 ? "purple" : "red"}
        hidden={priority === 2}
        variant={
          priority === 1 ? "outline" : priority === 2 ? undefined : "solid"
        }
        pl={3}
        pr={4}
        size="lg"
      >
        <MaterialSymbol p={0}>priority_high</MaterialSymbol>
        {priority === 1
          ? t("order.later", { defaultValue: "LATER" })
          : t("order.urgent", { defaultValue: "URGENT" })}
      </Badge>
    </HStack>
  );
}
