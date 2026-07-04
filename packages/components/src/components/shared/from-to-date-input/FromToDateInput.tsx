"use client";

import { Box, Button, HStack, IconButton, Stack } from "@chakra-ui/react";
import { i18n } from "i18next";
import { useState } from "react";
import { Tooltip } from "../../ui/tooltip";
import { CustomDialog } from "../CustomDialog";
import { DatePickerInput, formatDateInputValue } from "../date-picker-input";
import { MaterialSymbol } from "../MaterialSymbol";

function formatDateLabel(value: string, locale: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(locale);
}

interface Props {
  handleSetDate: (startDate: string, endDate: string) => void;
  initStartDate?: string;
  initEndDate?: string;
  disabled?: boolean;
  i18n: i18n;
  compactOnDesktop?: boolean;
  compactExpandAt?: string;
}

export function FromToDateInput({
  handleSetDate,
  initStartDate,
  initEndDate,
  disabled = false,
  i18n,
  compactOnDesktop = false,
  compactExpandAt = "1820px",
}: Props) {
  const [startDate, setStartDate] = useState(initStartDate ?? "");
  const [endDate, setEndDate] = useState(initEndDate ?? "");
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en-US";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date();
  endToday.setDate(endToday.getDate() + 1);
  endToday.setHours(23, 59, 59, 999);
  const [open, setOpen] = useState(false);
  const maxDate = formatDateInputValue(endToday);
  const compactExpandQuery = `@media screen and (min-width: ${compactExpandAt})`;

  function handleSetCurrentDate() {
    const currentDate = formatDateInputValue(new Date());
    setStartDate(formatDateInputValue(startToday));
    setEndDate(formatDateInputValue(endToday));
    handleSetDate(currentDate, currentDate);
  }

  function handleClearDate() {
    setStartDate("");
    setEndDate("");
    handleSetDate("", "");
  }

  function handleSaveDate() {
    handleSetDate(startDate, endDate);
  }

  const dateRangeLabel =
    startDate && endDate
      ? `${formatDateLabel(startDate, locale)} - ${formatDateLabel(endDate, locale)}`
      : i18n.t("common.selectDateRange", {
          defaultValue: "Select date range",
        });

  return (
    <HStack position={"relative"}>
      <Tooltip content={dateRangeLabel}>
        <Button
          variant={"outline"}
          colorPalette={startDate && endDate ? "primary" : undefined}
          onClick={() => setOpen(true)}
          disabled={disabled}
          aria-label={dateRangeLabel}
          px={compactOnDesktop ? "2.5" : undefined}
          css={
            compactOnDesktop
              ? {
                  [compactExpandQuery]: {
                    paddingInline: "var(--chakra-spacing-4)",
                  },
                }
              : undefined
          }
        >
          <MaterialSymbol>date_range</MaterialSymbol>
          <Box
            as="span"
            display={compactOnDesktop ? "none" : undefined}
            css={
              compactOnDesktop
                ? {
                    [compactExpandQuery]: {
                      display: "inline",
                    },
                  }
                : undefined
            }
          >
            {dateRangeLabel}
          </Box>
        </Button>
      </Tooltip>
      <CustomDialog
        header={i18n.t("common.selectDateRange", {
          defaultValue: "Select date range",
        })}
        open={open}
        setOpen={setOpen}
      >
        <Stack direction={{ base: "column", md: "row" }} gap={3}>
          <DatePickerInput
            flex="1"
            value={startDate}
            onValueChange={setStartDate}
            locale={locale}
            max={maxDate}
            showTodayButton={false}
            triggerLabel={i18n.t("common.startDate", {
              defaultValue: "Start date",
            })}
            inputProps={{
              "aria-label": i18n.t("common.startDate", {
                defaultValue: "Start date",
              }),
            }}
          />
          <DatePickerInput
            flex="1"
            value={endDate}
            onValueChange={setEndDate}
            locale={locale}
            max={maxDate}
            showTodayButton={false}
            triggerLabel={i18n.t("common.endDate", {
              defaultValue: "End date",
            })}
            inputProps={{
              "aria-label": i18n.t("common.endDate", {
                defaultValue: "End date",
              }),
            }}
          />
        </Stack>
        <Button mt={6} w={"100%"} onClick={handleSetCurrentDate}>
          <MaterialSymbol>today</MaterialSymbol>
          {i18n.t("common.todaysDate", { defaultValue: "Today's date" })}
        </Button>
        <Button
          mt={2}
          mb={2}
          w={"100%"}
          onClick={handleSaveDate}
          colorPalette={"primary"}
        >
          <MaterialSymbol>save</MaterialSymbol>
          {i18n.t("common.save", { defaultValue: "Save" })}
        </Button>
      </CustomDialog>
      {startDate && endDate && (
        <IconButton
          onClick={handleClearDate}
          colorPalette={"primary"}
          rounded={"full"}
          position={"absolute"}
          size={"2xs"}
          top={-2}
          right={-2}
          aria-label={i18n.t("common.clear", { defaultValue: "Clear" })}
        >
          <MaterialSymbol>close</MaterialSymbol>
        </IconButton>
      )}
    </HStack>
  );
}
