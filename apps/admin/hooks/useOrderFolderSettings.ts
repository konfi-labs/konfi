"use client";

import {
  BrowserOrderFolderAccessConfig,
  createElectronOrderFolderConfig,
  OrderFolderAccessConfig,
  OrderFolderAccessSettings,
  parseOrderFolderSettings,
  serializeOrderFolderSettings,
} from "@/lib/order-folder-access";
import { useCallback, useEffect, useState } from "react";

export type OrderFolderSettings = OrderFolderAccessSettings;

const STORAGE_KEY = "order-folder-settings";

function readStoredSettings(): OrderFolderAccessSettings {
  const parsed = parseOrderFolderSettings(localStorage.getItem(STORAGE_KEY));
  if (parsed.migrated) {
    localStorage.setItem(
      STORAGE_KEY,
      serializeOrderFolderSettings(parsed.settings),
    );
  }
  return parsed.settings;
}

export function useOrderFolderSettings() {
  const [settings, setSettings] = useState<OrderFolderSettings>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      setSettings(readStoredSettings());
    } catch (error) {
      console.error("Error loading order folder settings:", error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const saveSettings = useCallback(
    (newSettings: OrderFolderSettings): boolean => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          serializeOrderFolderSettings(newSettings),
        );
        setSettings(newSettings);
        return true;
      } catch (error) {
        console.error("Error saving order folder settings:", error);
        return false;
      }
    },
    [],
  );

  const getConfig = useCallback(
    (channelId: string): OrderFolderAccessConfig | undefined => {
      return settings[channelId];
    },
    [settings],
  );

  const getFolderPath = useCallback(
    (channelId: string): string | undefined => {
      const config = settings[channelId];
      return config?.backend === "electron-path" ? config.path : undefined;
    },
    [settings],
  );

  const setFolderPath = useCallback(
    (channelId: string, path: string): boolean => {
      try {
        const currentSettings = readStoredSettings();
        return saveSettings({
          ...currentSettings,
          [channelId]: createElectronOrderFolderConfig(channelId, path),
        });
      } catch (error) {
        console.error("Error setting folder path:", error);
        return false;
      }
    },
    [saveSettings],
  );

  const setBrowserFolderConfig = useCallback(
    (config: BrowserOrderFolderAccessConfig): boolean => {
      try {
        const currentSettings = readStoredSettings();
        return saveSettings({
          ...currentSettings,
          [config.channelId]: config,
        });
      } catch (error) {
        console.error("Error setting browser folder config:", error);
        return false;
      }
    },
    [saveSettings],
  );

  const removeFolderPath = useCallback(
    (channelId: string): boolean => {
      try {
        const currentSettings = readStoredSettings();
        const newSettings = { ...currentSettings };
        delete newSettings[channelId];
        return saveSettings(newSettings);
      } catch (error) {
        console.error("Error removing folder path:", error);
        return false;
      }
    },
    [saveSettings],
  );

  return {
    settings,
    isLoaded,
    getConfig,
    getFolderPath,
    setFolderPath,
    setBrowserFolderConfig,
    removeFolderPath,
    removeFolderAccess: removeFolderPath,
  };
}
