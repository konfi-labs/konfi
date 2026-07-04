import type { AgentInteractionSpec } from "@/lib/ai/agent-harness";
import {
  Badge,
  Box,
  Button,
  Card,
  Circle,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";

interface AgentInteractionPanelLabels {
  prefilledData: string;
  selected: string;
  titleFallback: string;
  valueLabel: string;
}

interface AgentInteractionPanelProps {
  interaction: AgentInteractionSpec;
  labels: AgentInteractionPanelLabels;
  onSelectValue?: (value: string) => void;
  selectedValue?: string;
}

function formatFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

export function AgentInteractionPanel({
  interaction,
  labels,
  onSelectValue,
  selectedValue,
}: AgentInteractionPanelProps) {
  const fields = interaction.fields ?? [];

  return (
    <Card.Root variant="outline" colorPalette="orange" borderRadius="xl" mb={3}>
      <Card.Body py={4} px={4}>
        <VStack align="stretch" gap={3}>
          <HStack gap={2} align="center">
            <MaterialSymbol>help</MaterialSymbol>
            <Text fontSize="sm" fontWeight="semibold">
              {interaction.title || labels.titleFallback}
            </Text>
          </HStack>

          {interaction.body && (
            <Text fontSize="sm" color="fg.muted" whiteSpace="pre-wrap">
              {interaction.body}
            </Text>
          )}

          {fields.map((field) => {
            if (field.kind === "select" && field.options?.length) {
              return (
                <Box key={field.id}>
                  <Text
                    fontSize="xs"
                    fontWeight="medium"
                    color="fg.muted"
                    mb={2}
                  >
                    {field.label}
                  </Text>
                  <VStack align="stretch" gap={2}>
                    {field.options.map((option) => {
                      const isSelected = selectedValue === option.value;

                      return (
                        <Button
                          key={`${field.id}-${option.value}`}
                          type="button"
                          aria-pressed={isSelected}
                          size="sm"
                          variant="outline"
                          colorPalette="gray"
                          borderRadius="xl"
                          borderColor={
                            isSelected ? "primary.solid" : "border.emphasized"
                          }
                          borderWidth="1px"
                          bg={isSelected ? "primary.muted" : "bg"}
                          color="fg"
                          h="auto"
                          minH={10}
                          py={2}
                          px={3}
                          justifyContent="flex-start"
                          textAlign="start"
                          whiteSpace="normal"
                          _hover={{
                            bg: isSelected ? "primary.subtle" : "bg.subtle",
                            borderColor: isSelected
                              ? "primary.solid"
                              : "border.emphasized",
                          }}
                          _focusVisible={{
                            outline: "2px solid",
                            outlineColor: "primary.solid",
                            outlineOffset: "2px",
                          }}
                          onClick={() => onSelectValue?.(option.value)}
                        >
                          <Circle
                            size={5}
                            mt={0.5}
                            flexShrink={0}
                            borderWidth="1px"
                            borderColor={
                              isSelected ? "primary.solid" : "border.emphasized"
                            }
                            bg={isSelected ? "primary.solid" : "transparent"}
                            color={
                              isSelected ? "primary.contrast" : "transparent"
                            }
                          >
                            <MaterialSymbol fontSize="0.85em">
                              check
                            </MaterialSymbol>
                          </Circle>
                          <VStack align="start" gap={1} flex={1} minW={0}>
                            <HStack gap={2} wrap="wrap">
                              <Text
                                fontSize="sm"
                                fontWeight="medium"
                                overflowWrap="anywhere"
                              >
                                {option.label}
                              </Text>
                              {isSelected && (
                                <Badge
                                  size="xs"
                                  colorPalette="primary"
                                  variant="solid"
                                >
                                  {labels.selected}
                                </Badge>
                              )}
                            </HStack>
                            {option.description && (
                              <Text
                                fontSize="xs"
                                color="fg.muted"
                                overflowWrap="anywhere"
                              >
                                {option.description}
                              </Text>
                            )}
                            <Text
                              fontSize="xs"
                              color="fg.muted"
                              fontFamily="mono"
                              wordBreak="break-all"
                            >
                              {labels.valueLabel}: {option.value}
                            </Text>
                          </VStack>
                        </Button>
                      );
                    })}
                  </VStack>
                </Box>
              );
            }

            const formattedValue = formatFieldValue(field.value);
            if (!formattedValue) {
              return null;
            }

            return (
              <Box key={field.id}>
                <Text fontSize="xs" fontWeight="medium" color="fg.muted" mb={1}>
                  {field.label || labels.prefilledData}
                </Text>
                <Box
                  as="pre"
                  whiteSpace="pre-wrap"
                  overflowX="auto"
                  p={3}
                  borderRadius="lg"
                  borderWidth="1px"
                  borderColor="gray.muted"
                  fontSize="xs"
                >
                  {formattedValue}
                </Box>
              </Box>
            );
          })}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export default AgentInteractionPanel;
