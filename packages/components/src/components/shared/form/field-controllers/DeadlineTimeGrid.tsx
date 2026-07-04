"use client";

import { Badge, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";

export const DEFAULT_DEADLINE_TIME = "12:00";

export const DEADLINE_TIME_OPTIONS = Array.from(
  { length: 48 },
  (_, optionIndex) => {
    const hour = Math.floor(optionIndex / 2)
      .toString()
      .padStart(2, "0");
    const minute = optionIndex % 2 === 0 ? "00" : "30";

    return `${hour}:${minute}`;
  },
);

interface DeadlineTimeGridProps {
  value?: string;
  onValueChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}

export function DeadlineTimeGrid({
  value,
  onValueChange,
  label,
  disabled = false,
}: DeadlineTimeGridProps) {
  const selectedTime = value || DEFAULT_DEADLINE_TIME;

  return (
    <VStack align="stretch" gap={2} h="full" minH={0}>
      <HStack justify="space-between" gap={3} flexShrink={0}>
        <Text color="fg.muted" fontSize="sm" fontWeight="medium">
          {label}
        </Text>
        <Badge size="sm" variant="surface">
          {selectedTime}
        </Badge>
      </HStack>
      <Box overflowY="auto" flex="1" minH={0} pr={1}>
        <VStack align="stretch" gap={1}>
          {DEADLINE_TIME_OPTIONS.map((timeOption) => {
            const isSelected = selectedTime === timeOption;

            return (
              <Button
                key={timeOption}
                type="button"
                size="sm"
                variant={isSelected ? "solid" : "surface"}
                colorPalette={isSelected ? "primary" : "gray"}
                justifyContent="flex-start"
                aria-pressed={isSelected}
                aria-label={`${label}: ${timeOption}`}
                disabled={disabled}
                onClick={() => onValueChange(timeOption)}
              >
                {timeOption}
              </Button>
            );
          })}
        </VStack>
      </Box>
    </VStack>
  );
}
