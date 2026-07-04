import type { Channel } from "@konfi/types";

type ChannelIdentity = Pick<Channel, "id" | "name">;

type InitialChannelSelection<TChannel extends ChannelIdentity> = {
  channel: TChannel | null;
  defaultComputerChannel: TChannel | null;
  invalidCurrentChannelId: string | null;
  invalidDefaultComputerChannelId: string | null;
  persistedCurrentChannelId: string | null;
  shouldPromptDefaultComputerChannelSetup: boolean;
};

export function resolveInitialChannelSelection<
  TChannel extends ChannelIdentity,
>({
  channels,
  channelsVerified,
  currentChannelId,
  defaultComputerChannelId,
}: {
  channels: TChannel[];
  channelsVerified: boolean;
  currentChannelId: string | null;
  defaultComputerChannelId: string | null;
}): InitialChannelSelection<TChannel> {
  const storedCurrentChannel = currentChannelId
    ? channels.find((channelItem) => channelItem.id === currentChannelId)
    : undefined;
  const storedDefaultComputerChannel = defaultComputerChannelId
    ? channels.find(
        (channelItem) => channelItem.id === defaultComputerChannelId,
      )
    : undefined;
  const channel =
    storedCurrentChannel ?? storedDefaultComputerChannel ?? channels[0] ?? null;
  const hasChannels = channels.length > 0;
  const persistedCurrentChannelId =
    !channelsVerified && currentChannelId && !storedCurrentChannel
      ? currentChannelId
      : channel?.id ?? null;

  return {
    channel,
    defaultComputerChannel: storedDefaultComputerChannel ?? null,
    invalidCurrentChannelId:
      channelsVerified &&
      hasChannels &&
      currentChannelId &&
      !storedCurrentChannel
        ? currentChannelId
        : null,
    invalidDefaultComputerChannelId:
      channelsVerified &&
      hasChannels &&
      defaultComputerChannelId &&
      !storedDefaultComputerChannel
        ? defaultComputerChannelId
        : null,
    persistedCurrentChannelId,
    shouldPromptDefaultComputerChannelSetup:
      channelsVerified && hasChannels && !storedDefaultComputerChannel,
  };
}
