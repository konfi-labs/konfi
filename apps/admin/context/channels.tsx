"use client";

import {
  loadAuthorizedChannels,
  removeChannelAction,
  type AuthorizedChannel,
} from "@/actions/channels";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { resolveInitialChannelSelection } from "@/lib/channels/selection";
import {
  Button,
  createListCollection,
  Dialog,
  Portal,
  Select,
} from "@chakra-ui/react";
import { Field } from "@konfi/components/ui/field";
import { toaster } from "@konfi/components/ui/toaster";
import { db, tenant } from "@konfi/firebase";
import { Channel, Order, type TenantContext } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { getCountFromServer, Timestamp } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./auth";
import { useTenantContext } from "./tenant";

const CURRENT_CHANNEL_STORAGE_KEY = "channel";
const DEFAULT_COMPUTER_CHANNEL_STORAGE_KEY = "defaultComputerChannel";
const DEFAULT_COMPUTER_CHANNEL_SETUP_DISMISSED_KEY =
  "defaultComputerChannelSetupDismissed";
const CHANNELS_CACHE_VERSION = 1;
const CHANNELS_CACHE_TTL_MS = 30 * 60 * 1000;
const CHANNELS_CACHE_STORAGE_PREFIX = "channels";
const channelsStorageCache = new Map<string, string | null>();

type CachedTimestamp = AuthorizedChannel["createdAt"];

type CachedChannel = AuthorizedChannel;

type ChannelsCachePayload = {
  cachedAt: number;
  channels: CachedChannel[];
  version: typeof CHANNELS_CACHE_VERSION;
};

function buildChannelsCacheKey(userId: string, tenantContext: TenantContext) {
  const tenantId = tenantContext.tenantId ?? "default";

  return `${CHANNELS_CACHE_STORAGE_PREFIX}:v${CHANNELS_CACHE_VERSION}:${tenantContext.deploymentMode}:${tenantId}:${userId}`;
}

function readSessionStorage(key: string) {
  if (channelsStorageCache.has(key)) {
    return channelsStorageCache.get(key) ?? null;
  }

  try {
    const value = sessionStorage.getItem(key);
    channelsStorageCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
    channelsStorageCache.set(key, value);
  } catch {
    // Storage can be unavailable in private browsing or under quota pressure.
  }
}

function removeSessionStorage(key: string) {
  try {
    sessionStorage.removeItem(key);
    channelsStorageCache.delete(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function serializeTimestamp(timestamp: Channel["createdAt"]): CachedTimestamp {
  return {
    nanoseconds: timestamp.nanoseconds,
    seconds: timestamp.seconds,
  };
}

function serializeChannel(channel: Channel): CachedChannel {
  return {
    ...channel,
    createdAt: serializeTimestamp(channel.createdAt),
    updatedAt: serializeTimestamp(channel.updatedAt),
  };
}

function restoreTimestamp(timestamp: CachedTimestamp): Timestamp {
  return new Timestamp(timestamp.seconds, timestamp.nanoseconds);
}

function restoreChannel(channel: CachedChannel): Channel {
  return {
    ...channel,
    createdAt: restoreTimestamp(channel.createdAt),
    updatedAt: restoreTimestamp(channel.updatedAt),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCachedTimestamp(value: unknown): value is CachedTimestamp {
  return (
    isRecord(value) &&
    typeof value.seconds === "number" &&
    typeof value.nanoseconds === "number"
  );
}

function isCachedChannel(value: unknown): value is CachedChannel {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isCachedTimestamp(value.createdAt) &&
    isCachedTimestamp(value.updatedAt)
  );
}

function isChannelsCachePayload(value: unknown): value is ChannelsCachePayload {
  return (
    isRecord(value) &&
    value.version === CHANNELS_CACHE_VERSION &&
    typeof value.cachedAt === "number" &&
    Array.isArray(value.channels) &&
    value.channels.every(isCachedChannel)
  );
}

function readChannelsCache(cacheKey: string): Channel[] | null {
  const value = readSessionStorage(cacheKey);
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isChannelsCachePayload(parsed)) {
      removeSessionStorage(cacheKey);
      return null;
    }

    if (Date.now() - parsed.cachedAt > CHANNELS_CACHE_TTL_MS) {
      removeSessionStorage(cacheKey);
      return null;
    }

    return parsed.channels.map(restoreChannel);
  } catch {
    removeSessionStorage(cacheKey);
    return null;
  }
}

function writeChannelsCache(cacheKey: string, nextChannels: Channel[]) {
  const payload: ChannelsCachePayload = {
    cachedAt: Date.now(),
    channels: nextChannels.map(serializeChannel),
    version: CHANNELS_CACHE_VERSION,
  };

  writeSessionStorage(cacheKey, JSON.stringify(payload));
}

function getChannelDebugItems(channels: Channel[] | null) {
  return (
    channels?.map((channelItem) => ({
      id: channelItem.id,
      name: channelItem.name,
    })) ?? null
  );
}

interface IChannel {
  loadingChannels: boolean;
  channel: Channel | null;
  defaultComputerChannel: Channel | null;
  isDefaultComputerChannelSetupOpen: boolean;
  channels: Channel[] | null;
  refreshChannels: () => void;
  setChannel: (option: { value: string | undefined }) => void;
  setDefaultComputerChannel: (option: { value: string | undefined }) => void;
  removeChannel: (channelId: Channel["id"]) => void;
  getChannelById: (channelId: string) => Channel | undefined;
}

const ChannelContext = createContext<IChannel>({
  loadingChannels: true,
  channel: null,
  defaultComputerChannel: null,
  isDefaultComputerChannelSetupOpen: false,
  channels: null,
  refreshChannels: () => {},
  setChannel: () => {},
  setDefaultComputerChannel: () => {},
  removeChannel: () => {},
  getChannelById: () => undefined,
});

const ChannelsProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useT();
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [channelsVerified, setChannelsVerified] = useState(false);
  const [channel, _setChannel] = useState<Channel | null>(null);
  const [defaultComputerChannel, _setDefaultComputerChannel] =
    useState<Channel | null>(null);
  const [defaultComputerChannelSetupOpen, setDefaultComputerChannelSetupOpen] =
    useState(false);
  const [defaultComputerChannelSelection, setDefaultComputerChannelSelection] =
    useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [dirtyRefreshChannels, setDirtyRefreshChannels] =
    useState<boolean>(false);
  const { user, isAdminClient } = useAuth();
  const tenantContext = useTenantContext();
  const channelsCacheKey = useMemo(() => {
    if (!user?.uid) return null;

    return buildChannelsCacheKey(user.uid, tenantContext);
  }, [tenantContext, user?.uid]);
  const canUseChannelsCache =
    tenantContext.deploymentMode !== "saas" && !tenantContext.requireTenantId;
  const channelOptions = useMemo(
    () =>
      (channels ?? []).map((currentChannel) => ({
        label: currentChannel.name,
        value: currentChannel.id,
      })),
    [channels],
  );
  const defaultComputerChannelCollection = useMemo(
    () =>
      createListCollection({
        items: channelOptions,
      }),
    [channelOptions],
  );

  useEffect(() => {
    if (!user?.uid) return;

    if (!isAdminClient) {
      setChannels([]);
      _setChannel(null);
      setChannelsVerified(true);
      setLoadingChannels(false);
      return;
    }

    let cancelled = false;
    const cacheKey = channelsCacheKey;
    const cachedChannels =
      canUseChannelsCache && cacheKey ? readChannelsCache(cacheKey) : null;

    if (cachedChannels) {
      setChannels(cachedChannels);
      setChannelsVerified(false);
      setLoadingChannels(false);
    } else {
      setChannelsVerified(false);
      setLoadingChannels(true);
    }

    async function loadChannels() {
      try {
        const authorizedChannels = await loadAuthorizedChannels();
        if (cancelled) return;

        const nextChannels = authorizedChannels.map(restoreChannel);
        setChannels(nextChannels);
        setChannelsVerified(true);
        setLoadingChannels(false);
        if (canUseChannelsCache && cacheKey) {
          writeChannelsCache(cacheKey, nextChannels);
        }
      } catch (error) {
        if (cancelled) return;

        console.error(
          t("channels.loadFailed", {
            defaultValue: "Failed to load channels",
          }),
          error,
        );
        if (!cachedChannels) {
          setChannels(null);
        }
        setChannelsVerified(Boolean(cachedChannels));
        setLoadingChannels(false);
      }
    }

    void loadChannels();

    return () => {
      cancelled = true;
    };
  }, [
    canUseChannelsCache,
    channelsCacheKey,
    dirtyRefreshChannels,
    isAdminClient,
    t,
    user?.uid,
  ]);

  useEffect(() => {
    if (!channels || !user?.uid) return;
    const localStorageChannelId = localStorage.getItem(
      CURRENT_CHANNEL_STORAGE_KEY,
    );
    const localStorageDefaultComputerChannelId = localStorage.getItem(
      DEFAULT_COMPUTER_CHANNEL_STORAGE_KEY,
    );
    const selection = resolveInitialChannelSelection({
      channels,
      channelsVerified,
      currentChannelId: localStorageChannelId,
      defaultComputerChannelId: localStorageDefaultComputerChannelId,
    });

    if (selection.invalidCurrentChannelId) {
      console.warn(
        `Channel with id ${selection.invalidCurrentChannelId} does not exist in Channels array`,
        {
          availableChannels: getChannelDebugItems(channels),
          channelsVerified,
          storedCurrentChannelId: localStorageChannelId,
          storedDefaultComputerChannelId: localStorageDefaultComputerChannelId,
        },
      );
      localStorage.removeItem(CURRENT_CHANNEL_STORAGE_KEY);
    }

    if (selection.channel) {
      _setChannel(selection.channel);
      localStorage.setItem(
        CURRENT_CHANNEL_STORAGE_KEY,
        selection.persistedCurrentChannelId ?? selection.channel.id,
      );
    } else {
      console.warn(`No channels found`);
      _setChannel(null);
      localStorage.removeItem(CURRENT_CHANNEL_STORAGE_KEY);
    }

    if (selection.invalidDefaultComputerChannelId) {
      console.warn(
        `Default computer channel with id ${selection.invalidDefaultComputerChannelId} does not exist in Channels array`,
        {
          availableChannels: getChannelDebugItems(channels),
          channelsVerified,
          storedCurrentChannelId: localStorageChannelId,
          storedDefaultComputerChannelId: localStorageDefaultComputerChannelId,
        },
      );
      localStorage.removeItem(DEFAULT_COMPUTER_CHANNEL_STORAGE_KEY);
    }

    if (selection.defaultComputerChannel) {
      _setDefaultComputerChannel(selection.defaultComputerChannel);
      setDefaultComputerChannelSelection([selection.defaultComputerChannel.id]);
      setDefaultComputerChannelSetupOpen(false);
      return;
    }

    _setDefaultComputerChannel(null);
    setDefaultComputerChannelSelection(
      selection.channel ? [selection.channel.id] : [],
    );
    if (
      selection.shouldPromptDefaultComputerChannelSetup &&
      !sessionStorage.getItem(DEFAULT_COMPUTER_CHANNEL_SETUP_DISMISSED_KEY)
    ) {
      console.warn("[ChannelsProvider] default computer channel setup opened", {
        availableChannels: getChannelDebugItems(channels),
        channelsVerified,
        resolvedChannelId: selection.channel?.id ?? null,
        resolvedDefaultComputerChannelId: null,
        shouldPromptDefaultComputerChannelSetup:
          selection.shouldPromptDefaultComputerChannelSetup,
        storedCurrentChannelId: localStorageChannelId,
        storedDefaultComputerChannelId: localStorageDefaultComputerChannelId,
      });
      setDefaultComputerChannelSetupOpen(true);
    }
  }, [channels, channelsVerified, user?.uid]);

  const saveDefaultComputerChannel = useCallback(
    (channelId: string | undefined) => {
      if (!channelId) {
        return;
      }

      const selectedChannel = channels?.find(
        (channelItem) => channelItem.id === channelId,
      );
      if (selectedChannel) {
        _setChannel(selectedChannel);
        _setDefaultComputerChannel(selectedChannel);
        setDefaultComputerChannelSelection([selectedChannel.id]);
        localStorage.setItem(CURRENT_CHANNEL_STORAGE_KEY, selectedChannel.id);
        localStorage.setItem(
          DEFAULT_COMPUTER_CHANNEL_STORAGE_KEY,
          selectedChannel.id,
        );
        sessionStorage.removeItem(DEFAULT_COMPUTER_CHANNEL_SETUP_DISMISSED_KEY);
        console.info("[ChannelsProvider] default computer channel saved", {
          availableChannels: getChannelDebugItems(channels ?? null),
          selectedChannelId: selectedChannel.id,
          selectedChannelName: selectedChannel.name,
          storedCurrentChannelId: localStorage.getItem(
            CURRENT_CHANNEL_STORAGE_KEY,
          ),
          storedDefaultComputerChannelId: localStorage.getItem(
            DEFAULT_COMPUTER_CHANNEL_STORAGE_KEY,
          ),
        });
        setDefaultComputerChannelSetupOpen(false);
        queueMicrotask(() => {
          toaster.create({
            title: t("channel.defaultComputerChannel.changed", {
              defaultValue: "Default Computer Channel Saved",
            }),
            description: t("channel.defaultComputerChannel.changedTo", {
              defaultValue: "This computer now uses {{name}} by default",
              name: selectedChannel.name,
            }),
            type: "success",
            duration: 1500,
            id: "default-computer-channel-changed",
          });
        });
      } else {
        console.warn(
          `Channel with id ${channelId} does not exist in Channels array [setDefaultComputerChannel Function]`,
        );
      }
    },
    [channels, t],
  );

  const refreshChannels = useCallback(() => {
    setDirtyRefreshChannels((currentValue) => !currentValue);
  }, []);

  const setChannel = useCallback(
    function setChannel(option: { value: string | undefined }) {
      if (isUndefined(option)) {
        throw new Error("setChannel requires an option value.");
      }

      if (!option.value || option.value === channel?.id) {
        return;
      }
      if (!channels) {
        return;
      }

      const selectedChannel = channels.find(
        (channelItem) => channelItem.id === option.value,
      );
      if (selectedChannel) {
        _setChannel(selectedChannel);
        localStorage.setItem(CURRENT_CHANNEL_STORAGE_KEY, selectedChannel.id);
        queueMicrotask(() => {
          toaster.create({
            title: t("channel.changed", { defaultValue: "Channel Changed" }),
            description: t("channel.changedTo", {
              defaultValue: "Changed channel to {{name}}",
              name: selectedChannel.name,
            }),
            type: "info",
            duration: 1500,
            id: "channel-changed",
          });
        });
      } else {
        console.warn(
          `Channel with id ${option.value} does not exist in Channels array [setChannel Function]`,
        );
      }
    },
    [channel?.id, channels, t],
  );

  const setDefaultComputerChannel = useCallback(
    (option: { value: string | undefined }) => {
      if (isUndefined(option)) {
        throw new Error("setDefaultComputerChannel requires an option value.");
      }

      saveDefaultComputerChannel(option.value);
    },
    [saveDefaultComputerChannel],
  );

  const hasOrders = useCallback(
    async (channelId: Channel["id"]): Promise<boolean> => {
      try {
        const orderCount = (
          await getCountFromServer(
            db.query<Order>(
              firestore,
              "/channels/" + channelId + "/orders",
              1,
              undefined,
              tenant.queryConstraints(tenantContext),
            ),
          )
        ).data().count;
        if (orderCount > 0) return true;
        else return false;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    [tenantContext],
  );

  const removeChannel = useCallback(
    async (channelId: Channel["id"]) => {
      try {
        const channelHasOrders = await hasOrders(channelId);
        if (!channelHasOrders) {
          setLoadingChannels(true);
          await removeChannelAction(channelId);
          refreshChannels();
          setLoadingChannels(false);
          return;
        }

        throw new Error("Cannot delete a channel that still has orders.");
      } catch (error) {
        console.error(error);
        setLoadingChannels(false);
      }
    },
    [hasOrders, refreshChannels],
  );

  const getChannelById = useCallback(
    (channelId: string): Channel | undefined => {
      return channels?.find((channelItem) => channelItem.id === channelId);
    },
    [channels],
  );

  const value = useMemo(
    () => ({
      loadingChannels,
      channel,
      defaultComputerChannel,
      isDefaultComputerChannelSetupOpen: defaultComputerChannelSetupOpen,
      channels,
      refreshChannels,
      setChannel,
      setDefaultComputerChannel,
      removeChannel,
      getChannelById,
    }),
    [
      channel,
      channels,
      defaultComputerChannel,
      defaultComputerChannelSetupOpen,
      getChannelById,
      loadingChannels,
      refreshChannels,
      removeChannel,
      setChannel,
      setDefaultComputerChannel,
    ],
  );

  return (
    <ChannelContext.Provider value={value}>
      {children}
      <Dialog.Root
        open={Boolean(user) && defaultComputerChannelSetupOpen}
        onOpenChange={({ open }) => setDefaultComputerChannelSetupOpen(open)}
        placement="center"
        size="md"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner px={{ base: 3, md: 6 }}>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t("channel.defaultComputerChannel.setupTitle", {
                    defaultValue: "Set This Computer's Default Channel",
                  })}
                </Dialog.Title>
                <Dialog.Description>
                  {t("channel.defaultComputerChannel.setupDescription", {
                    defaultValue:
                      "Choose the channel assigned to this computer. Konfi will warn before creating sales documents in another channel.",
                  })}
                </Dialog.Description>
              </Dialog.Header>
              <Dialog.Body>
                <Field
                  label={t("channel.defaultComputerChannel.selectLabel", {
                    defaultValue: "Default channel",
                  })}
                >
                  <Select.Root
                    collection={defaultComputerChannelCollection}
                    value={defaultComputerChannelSelection}
                    onValueChange={({ value }) => {
                      setDefaultComputerChannelSelection(value);
                    }}
                    disabled={channelOptions.length === 0}
                  >
                    <Select.HiddenSelect name="defaultComputerChannel" />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText
                          placeholder={t(
                            "channel.defaultComputerChannel.selectPlaceholder",
                            {
                              defaultValue: "Select channel…",
                            },
                          )}
                        />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Select.Positioner>
                      <Select.Content>
                        {defaultComputerChannelCollection.items.map((item) => (
                          <Select.Item key={item.value} item={item}>
                            {item.label}
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Select.Root>
                </Field>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => {
                    sessionStorage.setItem(
                      DEFAULT_COMPUTER_CHANNEL_SETUP_DISMISSED_KEY,
                      "1",
                    );
                    setDefaultComputerChannelSetupOpen(false);
                  }}
                >
                  {t("channel.defaultComputerChannel.remindLater", {
                    defaultValue: "Remind Me Later",
                  })}
                </Button>
                <Button
                  colorPalette="primary"
                  disabled={defaultComputerChannelSelection.length === 0}
                  onClick={() => {
                    saveDefaultComputerChannel(
                      defaultComputerChannelSelection[0],
                    );
                  }}
                >
                  {t("channel.defaultComputerChannel.save", {
                    defaultValue: "Save Default Channel",
                  })}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </ChannelContext.Provider>
  );
};

const useChannels = () => useContext(ChannelContext);

export { ChannelsProvider, useChannels };
