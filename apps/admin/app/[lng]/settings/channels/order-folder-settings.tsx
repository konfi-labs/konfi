"use client";

import { useOrderFolderSettings } from "@/hooks/useOrderFolderSettings";
import { useT } from "@/i18n/client";
import {
  isBrowserOrderFolderAccessSupported,
  removeBrowserOrderRootHandle,
  requestBrowserOrderRootAccess,
} from "@/lib/order-folder-access";
import {
  Badge,
  Box,
  Button,
  Card,
  Heading,
  HStack,
  Input,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Field, MaterialSymbol, toaster } from "@konfi/components";
import { isElectron } from "@konfi/utils";
import { useChannels } from "context/channels";
import { useEffect, useState } from "react";

export default function OrderFolderSettings() {
  const { t } = useT();
  const { channels } = useChannels();
  const {
    getConfig,
    getFolderPath,
    setFolderPath,
    setBrowserFolderConfig,
    removeFolderAccess,
    isLoaded,
  } = useOrderFolderSettings();
  const [folderPaths, setFolderPaths] = useState<{ [key: string]: string }>({});
  const [connectingChannelId, setConnectingChannelId] = useState<string | null>(
    null,
  );
  const [runtime, setRuntime] = useState<{
    browserAccessSupported: boolean;
    electronApp: boolean;
  } | null>(null);
  const browserAccessSupported = runtime?.browserAccessSupported ?? false;
  const electronApp = runtime?.electronApp ?? false;

  // Initialize local state with settings
  useEffect(() => {
    if (isLoaded && channels) {
      const initialPaths: { [key: string]: string } = {};
      channels.forEach((channel) => {
        initialPaths[channel.id] = getFolderPath(channel.id) || "";
      });
      setFolderPaths(initialPaths);
    }
  }, [isLoaded, channels, getFolderPath]);

  useEffect(() => {
    setRuntime({
      browserAccessSupported: isBrowserOrderFolderAccessSupported(),
      electronApp: isElectron(),
    });
  }, []);

  const handleSelectFolder = async (channelId: string) => {
    if (!window.konfiDesktop?.orders) return;

    try {
      const selectedPath = await window.konfiDesktop.orders.pickOrderRoot();
      if (selectedPath) {
        setFolderPaths((prev) => ({
          ...prev,
          [channelId]: selectedPath,
        }));
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
      toaster.error({
        title: t("settings.error", { defaultValue: "Error" }),
        description: t("settings.folderSelectError", {
          defaultValue: "Failed to select folder",
        }),
      });
    }
  };

  const handleSave = (channelId: string) => {
    const path = folderPaths[channelId];
    if (path && path.trim()) {
      const success = setFolderPath(channelId, path.trim());
      if (success) {
        toaster.success({
          title: t("settings.success", { defaultValue: "Success" }),
          description: t("settings.folderPathSaved", {
            defaultValue: "Folder path saved successfully",
          }),
        });
      } else {
        toaster.error({
          title: t("settings.error", { defaultValue: "Error" }),
          description: t("settings.folderPathSaveError", {
            defaultValue: "Failed to save folder path. Storage may be full.",
          }),
        });
      }
    }
  };

  const handleConnectBrowserFolder = async (channelId: string) => {
    setConnectingChannelId(channelId);
    try {
      const config = await requestBrowserOrderRootAccess(channelId);
      if (!config) {
        return;
      }

      const success = setBrowserFolderConfig(config);
      if (success) {
        toaster.success({
          title: t("settings.success", { defaultValue: "Success" }),
          description: t("settings.browserFolderConnected", {
            defaultValue: "Orders root folder connected.",
          }),
        });
      } else {
        toaster.error({
          title: t("settings.error", { defaultValue: "Error" }),
          description: t("settings.folderPathSaveError", {
            defaultValue: "Failed to save folder path. Storage may be full.",
          }),
        });
      }
    } catch (error) {
      console.error("Error connecting browser folder:", error);
      toaster.error({
        title: t("settings.error", { defaultValue: "Error" }),
        description: t("settings.folderSelectError", {
          defaultValue: "Failed to select folder",
        }),
      });
    } finally {
      setConnectingChannelId(null);
    }
  };

  const handleRemove = (channelId: string) => {
    const success = removeFolderAccess(channelId);
    if (success) {
      setFolderPaths((prev) => ({
        ...prev,
        [channelId]: "",
      }));
      toaster.success({
        title: t("settings.success", { defaultValue: "Success" }),
        description: t("settings.folderPathRemoved", {
          defaultValue: "Folder path removed successfully",
        }),
      });
    } else {
      toaster.error({
        title: t("settings.error", { defaultValue: "Error" }),
        description: t("settings.folderPathRemoveError", {
          defaultValue: "Failed to remove folder path. Please try again.",
        }),
      });
    }
  };

  const handleDisconnectBrowserFolder = async (channelId: string) => {
    try {
      await removeBrowserOrderRootHandle(channelId);
    } catch (error) {
      console.warn("Failed to remove browser order folder handle:", error);
    }
    handleRemove(channelId);
  };

  const handleInputChange = (channelId: string, value: string) => {
    setFolderPaths((prev) => ({
      ...prev,
      [channelId]: value,
    }));
  };

  if (!runtime) {
    return null;
  }

  if (!electronApp && !browserAccessSupported) {
    return (
      <Box p={4}>
        <Text color="fg.muted">
          {t("settings.orderFolderBrowserUnsupported", {
            defaultValue:
              "Browser folder access is unavailable in this browser. Use Chrome or the desktop app.",
          })}
        </Text>
      </Box>
    );
  }

  if (!channels || channels.length === 0) {
    return (
      <Box p={4}>
        <Text color="fg.muted">
          {t("settings.noChannels", { defaultValue: "No channels available." })}
        </Text>
      </Box>
    );
  }

  return (
    <Box p={4}>
      <Heading size="lg" mb={4}>
        {t("settings.orderFolders", { defaultValue: "Order Folders" })}
      </Heading>
      <Text color="fg.muted" mb={6}>
        {t("settings.orderFoldersDescription", {
          defaultValue:
            "Configure the base folder path for orders for each channel. Orders will be organized in subfolders by order number.",
        })}
      </Text>
      <VStack gap={6} align="stretch">
        {channels.map((channel) => {
          const config = getConfig(channel.id);
          return (
            <Card.Root key={channel.id}>
              <Card.Body>
                <Heading size="md" mb={4}>
                  {channel.name}
                </Heading>
                <Separator mb={4} />
                {electronApp ? (
                  <>
                    <Field
                      label={t("settings.folderPath", {
                        defaultValue: "Base folder path",
                      })}
                      helperText={t("settings.folderPathHelper", {
                        defaultValue:
                          "Example: C:\\Orders or \\\\TRUENAS\\shared_data\\orders",
                      })}
                    >
                      <HStack gap={2}>
                        <Input
                          value={folderPaths[channel.id] || ""}
                          onChange={(e) =>
                            handleInputChange(channel.id, e.target.value)
                          }
                          placeholder="C:\\Orders"
                        />
                        <Button
                          onClick={() => handleSelectFolder(channel.id)}
                          variant="outline"
                          colorPalette="primary"
                        >
                          <MaterialSymbol>folder_open</MaterialSymbol>
                          {t("settings.browse", { defaultValue: "Browse" })}
                        </Button>
                      </HStack>
                    </Field>
                    <HStack gap={2} mt={4}>
                      <Button
                        onClick={() => handleSave(channel.id)}
                        colorPalette="primary"
                        disabled={
                          !folderPaths[channel.id] ||
                          folderPaths[channel.id] === getFolderPath(channel.id)
                        }
                      >
                        <MaterialSymbol>save</MaterialSymbol>
                        {t("settings.save", { defaultValue: "Save" })}
                      </Button>
                      {getFolderPath(channel.id) && (
                        <Button
                          onClick={() => handleRemove(channel.id)}
                          variant="outline"
                          colorPalette="red"
                        >
                          <MaterialSymbol>delete</MaterialSymbol>
                          {t("settings.remove", { defaultValue: "Remove" })}
                        </Button>
                      )}
                    </HStack>
                  </>
                ) : (
                  <VStack align="stretch" gap={4}>
                    <Text color="fg.muted">
                      {t("settings.browserFolderDescription", {
                        defaultValue:
                          "Connect the orders root folder through the browser picker. Konfi will list files from the order-number folder inside the admin order view.",
                      })}
                    </Text>
                    {config?.backend === "browser-handle" ? (
                      <HStack
                        gap={3}
                        justify="space-between"
                        align="center"
                        flexWrap="wrap"
                      >
                        <VStack align="start" gap={1} minW={0}>
                          <HStack gap={2} minW={0}>
                            <MaterialSymbol>folder</MaterialSymbol>
                            <Text fontWeight="600" truncate>
                              {config.displayName}
                            </Text>
                          </HStack>
                          <Badge
                            colorPalette={
                              config.permissionStatus === "granted"
                                ? "success"
                                : "orange"
                            }
                            variant="subtle"
                          >
                            {t(
                              `settings.orderFolderPermission.${config.permissionStatus}`,
                              {
                                defaultValue: config.permissionStatus,
                              },
                            )}
                          </Badge>
                        </VStack>
                        <HStack gap={2}>
                          <Button
                            onClick={() =>
                              handleConnectBrowserFolder(channel.id)
                            }
                            variant="outline"
                            colorPalette="primary"
                            loading={connectingChannelId === channel.id}
                          >
                            <MaterialSymbol>sync</MaterialSymbol>
                            {t("settings.reconnect", {
                              defaultValue: "Reconnect",
                            })}
                          </Button>
                          <Button
                            onClick={() =>
                              handleDisconnectBrowserFolder(channel.id)
                            }
                            variant="outline"
                            colorPalette="red"
                          >
                            <MaterialSymbol>delete</MaterialSymbol>
                            {t("settings.remove", { defaultValue: "Remove" })}
                          </Button>
                        </HStack>
                      </HStack>
                    ) : (
                      <Button
                        alignSelf="flex-start"
                        onClick={() => handleConnectBrowserFolder(channel.id)}
                        colorPalette="primary"
                        loading={connectingChannelId === channel.id}
                      >
                        <MaterialSymbol>folder_open</MaterialSymbol>
                        {t("settings.connectOrdersRoot", {
                          defaultValue: "Connect Orders Root",
                        })}
                      </Button>
                    )}
                  </VStack>
                )}
              </Card.Body>
            </Card.Root>
          );
        })}
      </VStack>
    </Box>
  );
}
