"use client";

import { useT } from "@/i18n/client";
import { Button, HStack, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { toaster } from "@konfi/components/ui/toaster";
import {
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@konfi/components/ui/menu";
import { useCallback, useEffect, useMemo, useState } from "react";

interface DesktopUpdaterStatus {
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean | null;
}

type ShouldUpdateState = () => boolean;

const getElectronUpdater = () => {
  const runtime = window.konfiDesktop?.runtime;

  if (!runtime?.checkForUpdates || !runtime.getVersion) {
    return null;
  }

  return runtime;
};

export default function DesktopUpdaterMenu() {
  const { t } = useT();
  const [desktopUpdaterStatus, setDesktopUpdaterStatus] =
    useState<DesktopUpdaterStatus | null>(null);
  const [isDesktopUpdaterAvailable, setIsDesktopUpdaterAvailable] =
    useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [hasStatusError, setHasStatusError] = useState(false);

  const loadStatus = useCallback(
    async (shouldUpdate: ShouldUpdateState = () => true) => {
      const electronUpdaterContext = getElectronUpdater();

      if (!electronUpdaterContext) {
        if (shouldUpdate()) {
          setIsDesktopUpdaterAvailable(false);
        }
        return;
      }

      if (shouldUpdate()) {
        setIsDesktopUpdaterAvailable(true);
        setIsLoadingStatus(true);
      }

      let currentVersion: string | null = null;

      try {
        currentVersion = await electronUpdaterContext.getVersion();
        const response = await fetch(
          `/api/desktop-updater/status?currentVersion=${encodeURIComponent(currentVersion)}&platform=${encodeURIComponent(electronUpdaterContext.platform)}`,
          {
            cache: "no-store",
            credentials: "same-origin",
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to load updater status: ${response.status}`);
        }

        const updaterStatus = (await response.json()) as DesktopUpdaterStatus;

        if (shouldUpdate()) {
          setDesktopUpdaterStatus(updaterStatus);
          setHasStatusError(false);
        }
      } catch (error) {
        console.error("Failed to load desktop updater status:", error);
        if (shouldUpdate()) {
          setDesktopUpdaterStatus({
            currentVersion,
            latestVersion: null,
            updateAvailable: null,
          });
          setHasStatusError(true);
        }
      } finally {
        if (shouldUpdate()) {
          setIsLoadingStatus(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await loadStatus(() => !cancelled);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  const handleCheckForDesktopUpdates = () => {
    const electronUpdaterContext = getElectronUpdater();

    if (!electronUpdaterContext) {
      return;
    }

    void electronUpdaterContext
      .checkForUpdates()
      .then(() => loadStatus())
      .catch((error) => {
        console.error("Failed to start desktop update check:", error);
        toaster.error({
          title: t("electron.updater.failedTitle", {
            defaultValue: "Update check failed",
          }),
          description: t("electron.updater.failedDescription", {
            defaultValue:
              "Failed to start the desktop update check. Please try again.",
          }),
        });
      });
  };

  const statusText = useMemo(() => {
    if (isLoadingStatus) {
      return t("common.loading", { defaultValue: "Loading..." });
    }

    if (hasStatusError || !desktopUpdaterStatus) {
      return t("electron.updater.statusUnavailable", {
        defaultValue: "Unable to load update status",
      });
    }

    if (desktopUpdaterStatus.updateAvailable) {
      return t("electron.updater.statusAvailable", {
        defaultValue: "Update available",
      });
    }

    return t("electron.updater.statusCurrent", {
      defaultValue: "Up to date",
    });
  }, [desktopUpdaterStatus, hasStatusError, isLoadingStatus, t]);

  const statusColor = desktopUpdaterStatus?.updateAvailable
    ? "orange.fg"
    : hasStatusError
      ? "red.fg"
      : "success.fg";
  const statusIcon = isLoadingStatus
    ? "sync"
    : desktopUpdaterStatus?.updateAvailable
      ? "system_update_alt"
      : hasStatusError
        ? "error"
        : "verified";
  const latestVersionText =
    desktopUpdaterStatus?.latestVersion ??
    (hasStatusError
      ? "-"
      : t("common.loading", { defaultValue: "Loading..." }));
  const currentVersionText =
    desktopUpdaterStatus?.currentVersion ??
    (hasStatusError
      ? "-"
      : t("common.loading", { defaultValue: "Loading..." }));

  if (!isDesktopUpdaterAvailable) {
    return null;
  }

  return (
    <MenuRoot lazyMount positioning={{ placement: "bottom-start" }}>
      <MenuTrigger
        asChild
        title={t("electron.updater.statusTitle", {
          defaultValue: "Desktop app",
        })}
      >
        <Button
          size="xs"
          variant="ghost"
          h={5}
          minW={0}
          px={2}
          color={statusColor}
        >
          <MaterialSymbol>{statusIcon}</MaterialSymbol>
          <Text as="span" fontSize="xs" maxW="140px" truncate>
            {statusText}
          </Text>
        </Button>
      </MenuTrigger>
      <MenuContent minW="260px">
        <MenuItemGroup
          title={t("electron.updater.statusTitle", {
            defaultValue: "Desktop app",
          })}
        >
          <VStack align="start" gap={1} px={3} py={2}>
            <HStack gap={2}>
              <MaterialSymbol>{statusIcon}</MaterialSymbol>
              <Text fontSize="sm" color={statusColor}>
                {statusText}
              </Text>
            </HStack>
            <Text fontSize="xs" color="fg.muted">
              {t("electron.updater.currentVersionLabel", {
                defaultValue: "Current version:",
              })}{" "}
              {currentVersionText}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              {t("electron.updater.latestVersionLabel", {
                defaultValue: "Latest version:",
              })}{" "}
              {latestVersionText}
            </Text>
          </VStack>
        </MenuItemGroup>
        <MenuSeparator />
        <MenuItem
          value="check-desktop-updates"
          onClick={handleCheckForDesktopUpdates}
        >
          <MaterialSymbol>system_update_alt</MaterialSymbol>
          {t("electron.updater.checkForUpdates", {
            defaultValue: "Check for desktop updates",
          })}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}
