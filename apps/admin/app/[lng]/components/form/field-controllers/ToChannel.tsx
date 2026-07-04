"use client";

import { useT } from "@/i18n/client";
import { createListCollection, Select } from "@chakra-ui/react";
import { Field } from "@konfi/components";
import { Channel } from "@konfi/types";
import { useChannels } from "context/channels";
import { isNull } from "es-toolkit";
import { useEffect, useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";

export const ToChannel = () => {
  const { t } = useT();
  const {
    setValue,
    control,
    formState: { errors },
  } = useFormContext();
  const { loadingChannels, channel, channels } = useChannels();

  const channelOptions = useMemo(
    () =>
      (channels ?? [])
        .filter(
          (currentChannel): currentChannel is Channel & { id: string; } =>
            !!currentChannel &&
            typeof currentChannel.id === "string" &&
            currentChannel.id.length > 0,
        )
        .map((currentChannel) => ({
          label: currentChannel.name,
          value: currentChannel.id,
        })),
    [channels],
  );

  const collection = useMemo(
    () =>
      createListCollection({
        items: channelOptions,
      }),
    [channelOptions],
  );

  useEffect(() => {
    if (loadingChannels || isNull(channel) || !channels?.length) return;
    const fullChannel =
      channels.find((c: { id?: string; }) => c.id === channel.id) || channel;
    setValue("toChannel", fullChannel, { shouldValidate: true });
  }, [loadingChannels, channel, channels, setValue]);

  if (loadingChannels || !channels || channels.length === 0) return null;

  return (
    <Controller
      name={"toChannel"}
      control={control}
      render={({ field }) => (
        <Field
          mt={4}
          label={t("admin.copyToChannel", { defaultValue: "Channel" })}
          invalid={!!errors[field.name]}
          errorText={`${errors[field.name]?.message}`}
          required
        >
          {(() => {
            const current: Channel | null = field.value;
            const resolved =
              current &&
              (current.name
                ? current
                : channels?.find((c: { id?: string; }) => c.id === current.id) ||
                current);
            const selectedId =
              resolved?.id && typeof resolved.id === "string"
                ? resolved.id
                : "";

            return (
              <Select.Root
                size="sm"
                collection={collection}
                value={selectedId ? [selectedId] : []}
                onValueChange={({ value: nextValue }) => {
                  const nextChannelId = nextValue[0];
                  if (!nextChannelId) {
                    return;
                  }

                  const nextChannel = channels?.find(
                    (obj: { id?: string; }) => obj.id === nextChannelId,
                  );
                  if (!nextChannel) {
                    return;
                  }

                  setValue(field.name, nextChannel, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  field.onChange(nextChannel);
                  field.onBlur();
                }}
                disabled={!channels || channels.length <= 0}
              >
                <Select.HiddenSelect name={field.name} />
                <Select.Control borderRadius="full" minW="150px">
                  <Select.Trigger>
                    <Select.ValueText
                      placeholder={t("admin.selectChannel", {
                        defaultValue: "Select channel",
                      })}
                    />
                  </Select.Trigger>
                  <Select.IndicatorGroup>
                    <Select.Indicator />
                  </Select.IndicatorGroup>
                </Select.Control>
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
              </Select.Root>
            );
          })()}
        </Field>
      )}
    />
  );
};
