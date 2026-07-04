"use client";

import {
  Button,
  HStack,
  Menu,
  Portal,
  Select,
  Stack,
  Text,
  createListCollection,
} from "@chakra-ui/react";
import { Field, MaterialSymbol } from "@konfi/components";
import { useT } from "@/i18n/client";
import { useMemo, useState } from "react";

export interface CopyFromChannelOption {
  value: string;
  label: string;
}

export function CopyFromChannelMenu({
  options,
  onCopy,
  triggerLabel,
}: {
  options: readonly CopyFromChannelOption[];
  onCopy: (channelId: string) => void;
  triggerLabel?: string;
}) {
  const { t } = useT();
  const [selected, setSelected] = useState<string>(options[0]?.value ?? "");

  const collection = useMemo(
    () =>
      createListCollection({
        items: options.map((o) => ({ value: o.value, label: o.label })),
      }),
    [options],
  );

  if (options.length === 0) {
    return null;
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button size="sm" variant="outline">
          <MaterialSymbol>content_copy</MaterialSymbol>
          {triggerLabel ??
            t("taxonomyEditor.copy.trigger", {
              defaultValue: "Copy from channel",
            })}
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="280px" p={3}>
            <Stack gap={2}>
              <Field
                label={t("taxonomyEditor.copy.label", {
                  defaultValue: "Source channel",
                })}
              >
                <Select.Root
                  collection={collection}
                  value={selected ? [selected] : []}
                  onValueChange={({ value }) => setSelected(value[0] ?? "")}
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t("taxonomyEditor.copy.placeholder", {
                          defaultValue: "Select channel…",
                        })}
                      />
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                      <Select.Indicator />
                    </Select.IndicatorGroup>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content>
                        {collection.items.map((item) => (
                          <Select.Item item={item} key={item.value}>
                            <Text>{item.label}</Text>
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
              </Field>
              <HStack justify="end">
                <Button
                  size="sm"
                  colorPalette="primary"
                  disabled={!selected}
                  onClick={() => {
                    if (selected) onCopy(selected);
                  }}
                >
                  {t("taxonomyEditor.copy.button", { defaultValue: "Copy" })}
                </Button>
              </HStack>
            </Stack>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
