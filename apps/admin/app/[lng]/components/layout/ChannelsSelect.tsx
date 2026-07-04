"use client";

import { useT } from "@/i18n/client";
import { createListCollection, Portal, Select } from "@chakra-ui/react";
import { SelectOption } from "@konfi/types";
import {
  ADMIN_CATALOG,
  ADMIN_CATALOG_PRODUCTS_EDIT,
  ADMIN_INTERNAL_ORDERS,
  ADMIN_ORDERS,
  ADMIN_QUOTES,
} from "@konfi/utils/routes";
import { useChannels } from "context/channels";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useMemo } from "react";

export default function ChannelsSelect({
  notPortalled = false,
}: {
  notPortalled?: boolean;
}) {
  const { t } = useT();
  const { loadingChannels, channel, channels, setChannel } = useChannels();

  const options = useMemo(() => {
    if (!channels) return null;

    return channels.map((currentChannel) => ({
      label: currentChannel.name,
      value: currentChannel.id,
    }));
  }, [channels]);

  const collection = useMemo(
    () =>
      createListCollection({
        items: (options ?? []).map((option) => ({
          label: option.label,
          value: option.value,
        })),
      }),
    [options],
  );

  const router = useRouter();
  const pathname = usePathname();
  const selectedValue = channel?.id ? [channel.id] : [];

  function handleChangeChannel(option: SelectOption | null) {
    if (!option) return;

    if (pathname?.includes(ADMIN_CATALOG_PRODUCTS_EDIT)) {
      router.push(ADMIN_CATALOG);
    }
    if (pathname?.includes(ADMIN_ORDERS + "/")) {
      router.push(ADMIN_ORDERS);
    }
    if (pathname?.includes(ADMIN_QUOTES + "/")) {
      router.push(ADMIN_QUOTES);
    }
    if (pathname?.includes(ADMIN_INTERNAL_ORDERS + "/")) {
      router.push(ADMIN_INTERNAL_ORDERS);
    }
    startTransition(() => {
      setChannel({ value: option.value });
    });
  }

  if (loadingChannels || !options) return null;

  return (
    <Select.Root
      size="xs"
      collection={collection}
      value={selectedValue}
      positioning={{ sameWidth: true }}
      onValueChange={({ value: nextValue }) => {
        const nextChannelId = nextValue[0];
        if (!nextChannelId || nextChannelId === channel?.id) return;

        const nextChannelOption =
          options.find((option) => option.value === nextChannelId) ?? null;
        handleChangeChannel(nextChannelOption);
      }}
      disabled={options.length <= 0}
    >
      <Select.HiddenSelect name="channel" />
      <Select.Control borderRadius="full" minW="100px">
        <Select.Trigger>
          <Select.ValueText
            placeholder={t("admin.selectChannelPlaceholder", {
              defaultValue: "Select channel...",
            })}
          />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal disabled={notPortalled}>
        <Select.Positioner>
          <Select.Content>
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item}>
                {item.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
