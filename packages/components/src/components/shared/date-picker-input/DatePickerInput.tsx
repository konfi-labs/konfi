"use client";

import {
  Box,
  Button,
  DatePicker,
  HStack,
  Portal,
  VStack,
  parseDate,
} from "@chakra-ui/react";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { MaterialSymbol } from "../MaterialSymbol";

type ChakraDatePickerRootProps = ComponentProps<typeof DatePicker.Root>;
type ChakraDatePickerInputProps = ComponentProps<typeof DatePicker.Input>;
type ChakraDatePickerDayTableProps = ComponentProps<typeof DatePicker.DayTable>;
type DatePickerContentEndElementProps = {
  close: () => void;
};
type DatePickerContentEndElement =
  | ReactNode
  | ((props: DatePickerContentEndElementProps) => ReactNode);
type SelectableDatePickerDayTableProps = ChakraDatePickerDayTableProps & {
  onDaySelect: (value: string) => void;
};

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDateTimeInputValue(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${formatDateInputValue(date)}T${hours}:${minutes}`;
}

export function getDateTimeInputParts(value?: string | null) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return { date: "", time: "" };
  }

  const match = normalizedValue.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T\s]+(\d{2}:\d{2}))?/,
  );

  return {
    date: match?.[1] ?? "",
    time: match?.[2] ?? "",
  };
}

export function normalizeDateInputValue(value?: string | null) {
  return getDateTimeInputParts(value).date;
}

const getDatePickerValue = (value?: string) => {
  const normalizedValue = normalizeDateInputValue(value);

  return normalizedValue ? [parseDate(normalizedValue)] : [];
};

const getParsedDateValue = (value?: string) => {
  const normalizedValue = normalizeDateInputValue(value);

  return normalizedValue ? parseDate(normalizedValue) : undefined;
};

export function getChangedDateInputValue(
  currentValue: string | undefined,
  nextValue: string,
  clickedValue?: string | null,
  focusedValue?: string | null,
) {
  const currentDate = normalizeDateInputValue(currentValue);
  const clickedDate = normalizeDateInputValue(clickedValue);
  const nextDate = normalizeDateInputValue(nextValue);
  const focusedDate = normalizeDateInputValue(focusedValue);

  if (nextDate && nextDate !== currentDate) {
    return nextDate;
  }

  if (clickedDate && clickedDate !== currentDate) {
    return clickedDate;
  }

  if (focusedDate && focusedDate !== currentDate) {
    return focusedDate;
  }

  return nextValue === "" && currentDate ? "" : null;
}

function SelectableDatePickerDayTable({
  onDaySelect,
  offset,
  weekNumberLabel = "#",
  ...props
}: SelectableDatePickerDayTableProps) {
  return (
    <DatePicker.Context>
      {(datePicker) => {
        const offsetDays = offset
          ? datePicker.getOffset({ months: offset })
          : undefined;
        const weeks = offsetDays ? offsetDays.weeks : datePicker.weeks;

        return (
          <DatePicker.Table {...props}>
            <DatePicker.TableHead>
              <DatePicker.TableRow>
                {datePicker.showWeekNumbers && (
                  <DatePicker.WeekNumberHeaderCell>
                    {weekNumberLabel}
                  </DatePicker.WeekNumberHeaderCell>
                )}
                {datePicker.weekDays.map((weekDay, id) => (
                  <DatePicker.TableHeader key={id}>
                    {weekDay.narrow}
                  </DatePicker.TableHeader>
                ))}
              </DatePicker.TableRow>
            </DatePicker.TableHead>
            <DatePicker.TableBody>
              {weeks.map((week, weekIndex) => (
                <DatePicker.TableRow key={weekIndex}>
                  {datePicker.showWeekNumbers && (
                    <DatePicker.WeekNumberCell
                      weekIndex={weekIndex}
                      week={week}
                    >
                      <DatePicker.WeekNumberCellText>
                        {datePicker.getWeekNumber(week)}
                      </DatePicker.WeekNumberCellText>
                    </DatePicker.WeekNumberCell>
                  )}
                  {week.map((day, id) => (
                    <DatePicker.TableCell
                      key={id}
                      value={day}
                      visibleRange={offsetDays?.visibleRange}
                    >
                      <DatePicker.TableCellTrigger
                        onClickCapture={() => onDaySelect(day.toString())}
                      >
                        {day.day}
                      </DatePicker.TableCellTrigger>
                    </DatePicker.TableCell>
                  ))}
                </DatePicker.TableRow>
              ))}
            </DatePicker.TableBody>
          </DatePicker.Table>
        );
      }}
    </DatePicker.Context>
  );
}

export interface DatePickerInputProps extends Omit<
  ChakraDatePickerRootProps,
  "defaultValue" | "locale" | "max" | "min" | "onValueChange" | "value"
> {
  value?: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  locale?: string;
  inputProps?: Omit<
    ChakraDatePickerInputProps,
    "defaultValue" | "onChange" | "value"
  >;
  triggerLabel?: string;
  showClearButton?: boolean;
  clearLabel?: string;
  icon?: ReactNode;
  showTodayButton?: boolean;
  todayLabel?: string;
  todayAriaLabel?: string;
  contentEndElement?: DatePickerContentEndElement;
}

export function DatePickerInput({
  value = "",
  onValueChange,
  min,
  max,
  locale = "en-US",
  inputProps,
  triggerLabel,
  showClearButton = false,
  clearLabel,
  icon,
  showTodayButton = true,
  todayLabel,
  todayAriaLabel,
  contentEndElement,
  onFocusChange,
  openOnClick = true,
  lazyMount = true,
  positioning = { placement: "bottom-start" },
  ...rootProps
}: DatePickerInputProps) {
  const latestFocusedValueRef = useRef<string | null>(null);
  const clickedValueRef = useRef<string | null>(null);
  const placeholder = inputProps?.placeholder;
  const inputDisplayKey = value || placeholder || "empty";
  const resolvedTodayAriaLabel =
    todayAriaLabel ?? todayLabel ?? triggerLabel ?? placeholder ?? "Today";
  const renderContentEndElement = (close: () => void) => {
    if (!contentEndElement) {
      return null;
    }

    return typeof contentEndElement === "function"
      ? contentEndElement({ close })
      : contentEndElement;
  };

  return (
    <DatePicker.Root
      {...rootProps}
      value={getDatePickerValue(value)}
      onFocusChange={(details) => {
        latestFocusedValueRef.current = details.focusedValue.toString();
        onFocusChange?.(details);
      }}
      onValueChange={(details) => {
        const nextValue =
          details.value[0]?.toString() ?? details.valueAsString[0] ?? "";
        const changedValue = getChangedDateInputValue(
          value,
          nextValue,
          clickedValueRef.current,
          latestFocusedValueRef.current,
        );
        clickedValueRef.current = null;
        latestFocusedValueRef.current = null;

        if (changedValue === null) {
          return;
        }

        onValueChange(changedValue);
      }}
      min={getParsedDateValue(min)}
      max={getParsedDateValue(max)}
      locale={locale}
      openOnClick={openOnClick}
      lazyMount={lazyMount}
      positioning={positioning}
      placeholder={placeholder}
    >
      <DatePicker.Control>
        <DatePicker.Input key={inputDisplayKey} {...inputProps} />
        <DatePicker.IndicatorGroup>
          {showClearButton && normalizeDateInputValue(value) ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              aria-label={clearLabel ?? "Clear"}
              onClick={(event) => {
                event.stopPropagation();
                onValueChange("");
              }}
            >
              <MaterialSymbol>close</MaterialSymbol>
            </Button>
          ) : null}
          <DatePicker.Trigger aria-label={triggerLabel}>
            {icon ?? <MaterialSymbol>calendar_month</MaterialSymbol>}
          </DatePicker.Trigger>
        </DatePicker.IndicatorGroup>
      </DatePicker.Control>
      <Portal>
        <DatePicker.Positioner>
          <DatePicker.Content>
            <DatePicker.Context>
              {(datePicker) => {
                const renderedContentEndElement = renderContentEndElement(() =>
                  datePicker.setOpen(false),
                );

                return (
                  <HStack align="stretch" gap={0}>
                    <VStack align="stretch" gap={2}>
                      <DatePicker.View view="day">
                        <DatePicker.Header />
                        <SelectableDatePickerDayTable
                          onDaySelect={(nextValue) => {
                            clickedValueRef.current = nextValue;
                          }}
                        />
                      </DatePicker.View>
                      <DatePicker.View view="month">
                        <DatePicker.Header />
                        <DatePicker.MonthTable />
                      </DatePicker.View>
                      <DatePicker.View view="year">
                        <DatePicker.Header />
                        <DatePicker.YearTable />
                      </DatePicker.View>
                      {showTodayButton && (
                        <Button
                          type="button"
                          size="2xs"
                          variant="ghost"
                          alignSelf="flex-end"
                          onClick={() =>
                            onValueChange(formatDateInputValue(new Date()))
                          }
                          aria-label={resolvedTodayAriaLabel}
                        >
                          <MaterialSymbol>today</MaterialSymbol>
                          {todayLabel}
                        </Button>
                      )}
                    </VStack>
                    {renderedContentEndElement ? (
                      <Box
                        borderLeftWidth="1px"
                        borderColor="border"
                        ml={3}
                        minW="11rem"
                        maxW="14rem"
                        alignSelf="stretch"
                        position="relative"
                        overflow="hidden"
                      >
                        <Box
                          position="absolute"
                          inset={0}
                          pl={3}
                          display="flex"
                          flexDirection="column"
                        >
                          {renderedContentEndElement}
                        </Box>
                      </Box>
                    ) : null}
                  </HStack>
                );
              }}
            </DatePicker.Context>
          </DatePicker.Content>
        </DatePicker.Positioner>
      </Portal>
    </DatePicker.Root>
  );
}
