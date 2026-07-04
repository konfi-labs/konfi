"use client";

import {
  Box,
  Button,
  Card,
  Collapsible,
  Field,
  HStack,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { TranslateFn } from "./types";

type ProviderSetupFormProps = {
  providerInput: string;
  processing: boolean;
  onProviderInputChange: (value: string) => void;
  onProcessProviderInput: () => void;
  t: TranslateFn;
};

export default function ProviderSetupForm({
  providerInput,
  processing,
  onProviderInputChange,
  onProcessProviderInput,
  t,
}: ProviderSetupFormProps) {
  const hasInput = providerInput.trim().length > 0;

  return (
    <Card.Root>
      <Collapsible.Root unmountOnExit>
        <Card.Header pb={7}>
          <Collapsible.Trigger asChild>
            <Box as="button" w="100%" cursor="pointer" textAlign="left">
              <HStack justifyContent="space-between" gap={3}>
                <VStack alignItems="flex-start" gap={1} minW={0}>
                  <Card.Title>
                    {t("externalProviders.addTitle", {
                      defaultValue: "Add External Provider",
                    })}
                  </Card.Title>
                  <Card.Description>
                    {t("externalProviders.addDescription", {
                      defaultValue:
                        "Paste any provider info (name, URLs, endpoints, sample IDs) and we will configure it automatically.",
                    })}
                  </Card.Description>
                </VStack>
                <Collapsible.Indicator
                  transition="transform 0.2s"
                  _open={{ transform: "rotate(180deg)" }}
                >
                  <MaterialSymbol>expand_more</MaterialSymbol>
                </Collapsible.Indicator>
              </HStack>
            </Box>
          </Collapsible.Trigger>
        </Card.Header>
        <Collapsible.Content>
          <Card.Body>
            <VStack gap={4} alignItems="stretch">
              <Field.Root>
                <Field.Label>
                  {t("externalProviders.fields.providerInput", {
                    defaultValue: "Provider info",
                  })}
                </Field.Label>
                <Textarea
                  value={providerInput}
                  onChange={(e) => onProviderInputChange(e.target.value)}
                  placeholder={t(
                    "externalProviders.fields.providerInputPlaceholder",
                    {
                      defaultValue:
                        "Example Supplier\nhttps://supplier.example.com/logo.png\nhttps://api.supplier.example.com/catalog-service/products\nhttps://api.supplier.example.com/catalog-service/product/{productId}.json\nprod_123",
                    },
                  )}
                  rows={6}
                  borderRadius="3xl"
                />
              </Field.Root>

              <Button
                colorPalette="primary"
                onClick={onProcessProviderInput}
                loading={processing}
                disabled={!hasInput}
              >
                {processing
                  ? t("externalProviders.processing", {
                      defaultValue: "Processing...",
                    })
                  : t("externalProviders.process", {
                      defaultValue: "Setup Provider",
                    })}
              </Button>
            </VStack>
          </Card.Body>
        </Collapsible.Content>
      </Collapsible.Root>
    </Card.Root>
  );
}
