"use client";

import { useEffect, useMemo, useState } from "react";
import { toaster } from "@konfi/components";

export type ChannelOption = { label: string; value: string };

export type ChannelMethodsToasts = {
  loadFailed: { title: string; description: string };
  saved: { title: string; description: string };
  saveFailed: { title: string; description: string };
  channelRequired: { title: string; description: string };
  copyLoaded: { title: string; description: string };
  copyFailed: { title: string; description: string };
};

type ChannelMethodsSettingsOptions<TMethod, TSettings> = {
  /** Current channel id. When undefined/empty the default state is shown. */
  channelId: string | undefined;
  /** Async loader for a single channel's settings. */
  loadSettings: (channelId: string) => Promise<TSettings>;
  /** Async saver for a single channel's settings. */
  saveSettings: (channelId: string, settings: TSettings) => Promise<void>;
  /** Creates the initial / fallback draft when no channel is selected. */
  createDefaultSettings: () => TSettings;
  /**
   * Converts a settings object into the in-memory draft array.
   * Called after every successful load and after copy-from-channel.
   */
  toDraftMethods: (settings: TSettings) => TMethod[];
  /**
   * Converts the current draft array into the settings object to persist.
   */
  toSettings: (methods: TMethod[]) => TSettings;
  /** User-visible toast strings — all four groups must be provided. */
  toasts: ChannelMethodsToasts;
  /**
   * Called synchronously after a successful save (before the success toast).
   * Use to refresh any derived store state (e.g. `refreshStoreSettings()`).
   */
  onSaveSuccess?: () => void;
  /**
   * Optional: when provided, the hook will NOT run a channel-load effect.
   * Instead it syncs `methods` from this value whenever it changes.
   * Useful for pages whose settings arrive via a shared context (e.g.
   * printing-methods reads from the configuration context rather than
   * triggering a per-channel Firestore load inside the page).
   */
  externalMethods?: TMethod[] | null;
  /**
   * All available channels (from useChannels). When provided together with
   * channelId, the hook computes and returns channelOptions (all channels
   * excluding the current one) so pages do not need to duplicate this logic.
   */
  allChannels?: ReadonlyArray<{ id: string; name: string }> | null;
};

type ChannelMethodsSettingsReturn<TMethod> = {
  methods: TMethod[];
  setMethods: React.Dispatch<React.SetStateAction<TMethod[]>>;
  isLoading: boolean;
  isSaving: boolean;
  isCopying: boolean;
  copySourceChannelId: string;
  setCopySourceChannelId: (id: string) => void;
  /** Channels available as copy sources (all channels except the current one). */
  channelOptions: ChannelOption[];
  handleSave: () => Promise<void>;
  handleCopyFromChannel: () => Promise<void>;
};

/**
 * Shared state-machine hook for channel-scoped methods configuration pages.
 *
 * Handles:
 *  - channel-triggered load with stale-response cancellation
 *  - save with channel-required guard and toast feedback
 *  - copy-from-channel with toast feedback
 *
 * Pass `externalMethods` to skip the channel-load effect and sync from an
 * external source instead (printing-methods pattern).
 */
export function useChannelMethodsSettings<TMethod, TSettings>(
  options: ChannelMethodsSettingsOptions<TMethod, TSettings>,
): ChannelMethodsSettingsReturn<TMethod> {
  const {
    channelId,
    loadSettings,
    saveSettings,
    createDefaultSettings,
    toDraftMethods,
    toSettings,
    toasts,
    onSaveSuccess,
    externalMethods,
    allChannels,
  } = options;

  const [methods, setMethods] = useState<TMethod[]>(() => {
    if (externalMethods != null) {
      return externalMethods;
    }
    return toDraftMethods(createDefaultSettings());
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copySourceChannelId, setCopySourceChannelId] = useState("");

  // When externalMethods is provided, sync from it (printing-methods pattern:
  // the configuration context already loads channel-specific settings).
  useEffect(() => {
    if (externalMethods == null) {
      return;
    }
    setMethods(externalMethods);
  }, [externalMethods]);

  // When no externalMethods, do the full channel-load effect (payment /
  // shipping pattern: load settings directly from Firestore for the channel).
  useEffect(() => {
    if (externalMethods != null) {
      // External source drives state — skip the network load.
      return;
    }

    let ignore = false;

    async function load(id: string) {
      setIsLoading(true);
      try {
        const settings = await loadSettings(id);
        if (!ignore) {
          setMethods(toDraftMethods(settings));
        }
      } catch (error) {
        console.error("Failed to load channel methods settings:", error);
        if (!ignore) {
          toaster.error({
            title: toasts.loadFailed.title,
            description: toasts.loadFailed.description,
          });
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    if (!channelId) {
      setMethods(toDraftMethods(createDefaultSettings()));
      return () => {
        ignore = true;
      };
    }

    void load(channelId);

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the channel changes; loader/default callbacks are stable per page
  }, [channelId]);

  const handleSave = async () => {
    if (!channelId) {
      toaster.error({
        title: toasts.channelRequired.title,
        description: toasts.channelRequired.description,
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings(channelId, toSettings(methods));
      onSaveSuccess?.();
      toaster.success({
        title: toasts.saved.title,
        description: toasts.saved.description,
      });
    } catch (error) {
      console.error("Failed to save channel methods settings:", error);
      toaster.error({
        title: toasts.saveFailed.title,
        description: toasts.saveFailed.description,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyFromChannel = async () => {
    if (!copySourceChannelId) {
      return;
    }

    setIsCopying(true);
    try {
      const sourceSettings = await loadSettings(copySourceChannelId);
      setMethods(toDraftMethods(sourceSettings));
      setCopySourceChannelId("");
      toaster.success({
        title: toasts.copyLoaded.title,
        description: toasts.copyLoaded.description,
      });
    } catch (error) {
      console.error("Failed to copy channel methods settings:", error);
      toaster.error({
        title: toasts.copyFailed.title,
        description: toasts.copyFailed.description,
      });
    } finally {
      setIsCopying(false);
    }
  };

  const channelOptions = useMemo<ChannelOption[]>(
    () =>
      (allChannels ?? [])
        .filter((candidate) => candidate.id !== channelId)
        .map((candidate) => ({
          label: candidate.name,
          value: candidate.id,
        })),
    [allChannels, channelId],
  );

  return {
    methods,
    setMethods,
    isLoading,
    isSaving,
    isCopying,
    copySourceChannelId,
    setCopySourceChannelId,
    channelOptions,
    handleSave,
    handleCopyFromChannel,
  };
}
