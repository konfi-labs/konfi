import { Button, HStack } from "@chakra-ui/react";
import { getEstimatedDelivery } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { TFunction } from "i18next";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  formatDateInputValue,
  formatDateTimeInputValue,
} from "../../date-picker-input";
import { MaterialSymbol } from "../../MaterialSymbol";
import { DEFAULT_DEADLINE_TIME } from "./DeadlineTimeGrid";

function getDateWithOffset(dayOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return date;
}

export function formatShortcutDeadline(
  date: Date,
  exactTime: boolean,
  currentDeadline?: string,
) {
  if (!exactTime) {
    return formatDateInputValue(date);
  }

  const currentTime =
    currentDeadline?.split("T")[1]?.slice(0, 5) ?? DEFAULT_DEADLINE_TIME;
  return `${formatDateInputValue(date)}T${currentTime}`;
}

export function SuggestDeadline({
  orderProcessingQueue,
  t,
}: {
  orderProcessingQueue: number;
  t: TFunction;
}) {
  const { getValues, setValue } = useFormContext();
  const orderItems = useWatch({ name: "items" });
  const exactTime = useWatch({ name: "exactTime" });

  const deadline = useMemo(() => {
    if (!orderItems || isEmpty(orderItems) || orderItems.length === 0) {
      return null;
    }
    const estimatedDelivery = getEstimatedDelivery(
      orderItems,
      orderProcessingQueue,
    );
    const deadlineString = !exactTime
      ? estimatedDelivery && formatDateInputValue(estimatedDelivery)
      : estimatedDelivery && formatDateTimeInputValue(estimatedDelivery);
    return deadlineString;
  }, [exactTime, orderItems, orderProcessingQueue]);

  function applyDeadline(nextDeadline: string | null) {
    if (!nextDeadline) {
      return;
    }

    setValue("deadlineString", nextDeadline, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  function applyShortcutDeadline(dayOffset: number) {
    const currentDeadline = getValues("deadlineString");
    applyDeadline(
      formatShortcutDeadline(
        getDateWithOffset(dayOffset),
        Boolean(exactTime),
        typeof currentDeadline === "string" ? currentDeadline : undefined,
      ),
    );
  }

  if (!orderItems || isEmpty(orderItems)) {
    return null;
  }

  return (
    <HStack position={"absolute"} right={0} top={-2} gap={1}>
      <Button
        colorPalette={"primary"}
        size={"2xs"}
        variant={"subtle"}
        onClick={() => applyShortcutDeadline(0)}
      >
        <MaterialSymbol>today</MaterialSymbol>
        {t("ui.today", { defaultValue: "Today" })}
      </Button>
      <Button
        colorPalette={"primary"}
        size={"2xs"}
        variant={"subtle"}
        onClick={() => applyShortcutDeadline(1)}
      >
        <MaterialSymbol>event_upcoming</MaterialSymbol>
        {t("ui.tomorrow", { defaultValue: "Tomorrow" })}
      </Button>
      {deadline && (
        <Button
          colorPalette={"primary"}
          size={"2xs"}
          variant={"ai"}
          onClick={() => applyDeadline(deadline)}
        >
          <MaterialSymbol>auto_awesome</MaterialSymbol>
          {t("ui.suggestDeadline", {
            date: deadline,
            defaultValue: "Apply suggested deadline ({{date}})",
          })}
        </Button>
      )}
    </HStack>
  );
}
