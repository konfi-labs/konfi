"use client";

import {
  Button,
  Card,
  createListCollection,
  HStack,
  Portal,
  Select,
} from "@chakra-ui/react";
import { Field, MaterialSymbol } from "@konfi/components";
import { useMemo } from "react";

type ChannelOption = { label: string; value: string };

/**
 * Shared "Copy From Channel" card used by all channel-methods configuration
 * pages. Renders the source-channel select and copy button. All copy logic
 * (loading, state, toasts) is handled by useChannelMethodsSettings — this
 * component is purely presentational.
 */
export function CopyFromChannelCard({
  title,
  description,
  label,
  placeholder,
  buttonLabel,
  channelOptions,
  copySourceChannelId,
  setCopySourceChannelId,
  isCopying,
  onCopy,
}: {
  title: string;
  description?: string;
  label: string;
  placeholder: string;
  buttonLabel: string;
  channelOptions: ChannelOption[];
  copySourceChannelId: string;
  setCopySourceChannelId: (id: string) => void;
  isCopying: boolean;
  onCopy: () => void;
}) {
  const copySourceCollection = useMemo(
    () => createListCollection({ items: channelOptions }),
    [channelOptions],
  );

  return (
    <Card.Root variant="outline" borderRadius="2xl">
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {description != null ? (
          <Card.Description>{description}</Card.Description>
        ) : null}
      </Card.Header>
      <Card.Body>
        <HStack align="end" gap={3} flexWrap="wrap">
          <Field
            label={label}
            maxW={{ base: "full", md: "360px" }}
            w="full"
          >
            <Select.Root
              collection={copySourceCollection}
              value={copySourceChannelId ? [copySourceChannelId] : []}
              onValueChange={({ value }) =>
                setCopySourceChannelId(value[0] ?? "")
              }
              disabled={channelOptions.length === 0 || isCopying}
            >
              <Select.HiddenSelect />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText placeholder={placeholder} />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content>
                    {copySourceCollection.items.map((item) => (
                      <Select.Item item={item} key={item.value}>
                        {item.label}
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </Field>
          <Button
            variant="outline"
            onClick={onCopy}
            disabled={!copySourceChannelId}
            loading={isCopying}
          >
            <MaterialSymbol>content_copy</MaterialSymbol>
            {buttonLabel}
          </Button>
        </HStack>
      </Card.Body>
    </Card.Root>
  );
}
