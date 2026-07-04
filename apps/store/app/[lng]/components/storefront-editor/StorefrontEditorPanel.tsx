"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Portal,
  Stack,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  type StorefrontHomeBlock,
  type StorefrontSharingSettings,
  type StorefrontThemeSettings,
} from "@konfi/types";
import { MaterialSymbol, Switch } from "@konfi/components";
import { useEffect, useState } from "react";
import {
  StorefrontEditorSharingSection,
  StorefrontEditorThemeSection,
} from "./StorefrontEditorPanelSections";
import { StorefrontEditorBlockSection } from "./StorefrontEditorBlockSection";

const sessionExpiryWarningMs = 5 * 60 * 1000;

const formatRemainingTime = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
};

const formatRelativeTime = (
  value: number | string | undefined,
  locale: string,
) => {
  if (value === undefined) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const relativeTimeFormat = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  });
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);

  if (Math.abs(minutes) < 60) {
    return relativeTimeFormat.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);

  if (Math.abs(hours) < 24) {
    return relativeTimeFormat.format(hours, "hour");
  }

  return relativeTimeFormat.format(Math.round(hours / 24), "day");
};

export function StorefrontEditorSessionCountdown({
  expiresAt,
}: {
  expiresAt?: number;
}) {
  const { t } = useT();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemainingMs(null);
      return;
    }

    const updateRemainingMs = () =>
      setRemainingMs(Math.max(0, expiresAt * 1000 - Date.now()));

    updateRemainingMs();
    const intervalId = window.setInterval(updateRemainingMs, 1000);

    return () => window.clearInterval(intervalId);
  }, [expiresAt]);

  if (!expiresAt) {
    return null;
  }

  const isExpired = remainingMs === 0;
  const isExpiringSoon =
    remainingMs !== null &&
    remainingMs > 0 &&
    remainingMs <= sessionExpiryWarningMs;

  return (
    <Badge
      borderRadius="full"
      colorPalette={isExpired || isExpiringSoon ? "orange" : "gray"}
      px={2}
      variant="subtle"
    >
      {remainingMs === null
        ? t("store.editor.panel.sessionChecking", {
            defaultValue: "Checking edit session",
          })
        : isExpired
          ? t("store.editor.panel.sessionExpired", {
              defaultValue: "Edit session expired",
            })
          : t("store.editor.panel.sessionRemaining", {
              defaultValue: "{{time}} left",
              time: formatRemainingTime(remainingMs),
            })}
    </Badge>
  );
}

export type StorefrontEditorAutosaveState =
  | "error"
  | "idle"
  | "saved"
  | "saving";

export interface StorefrontEditorRevisionSummary {
  changedAreas: Array<"home" | "sharing" | "theme">;
  createdAt?: number | string;
  id: string;
  rollbackRevisionId?: string;
  source: "publish" | "rollback";
}

interface StorefrontEditorPanelProps {
  adminCmsUrl?: string;
  autosaveState: StorefrontEditorAutosaveState;
  block?: StorefrontHomeBlock;
  editorSessionExpiresAt?: number;
  lng: string;
  maintenanceEnabled: boolean;
  maintenanceSaving: boolean;
  onChangeBlock: (block: StorefrontHomeBlock) => void;
  onChangeSharing: (sharing: StorefrontSharingSettings) => void;
  onChangeTheme: (theme: StorefrontThemeSettings) => void;
  onEditorUiVisibleChange: (visible: boolean) => void;
  onMaintenanceEnabledChange: (enabled: boolean) => void;
  onPublish: () => void;
  onRollback: (revisionId: string) => void;
  publishing: boolean;
  revisions: StorefrontEditorRevisionSummary[];
  rollingBackRevisionId?: string;
  sharing: StorefrontSharingSettings;
  theme: StorefrontThemeSettings;
}

export function StorefrontEditorPanel({
  adminCmsUrl,
  autosaveState,
  block,
  editorSessionExpiresAt,
  lng,
  maintenanceEnabled,
  maintenanceSaving,
  onChangeBlock,
  onChangeSharing,
  onChangeTheme,
  onEditorUiVisibleChange,
  onMaintenanceEnabledChange,
  onPublish,
  onRollback,
  publishing,
  revisions,
  rollingBackRevisionId,
  sharing,
  theme,
}: StorefrontEditorPanelProps) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState("section");
  const maintenanceModeLabel = t("store.editor.maintenance.title", {
    defaultValue: "Maintenance mode",
  });

  useEffect(() => {
    if (block?.id) {
      setActiveTab("section");
    }
    // Jump to the section tab whenever a block is picked on the canvas.
  }, [block?.id]);

  return (
    <Portal>
      <Box
        position="fixed"
        top={{ base: 3, md: 5 }}
        right={{ base: 3, md: 5 }}
        zIndex="modal"
        w={{ base: "calc(100vw - 24px)", md: "360px" }}
        maxH="80vh"
        display="flex"
        flexDirection="column"
        bg={{ base: "whiteAlpha.800", _dark: "blackAlpha.700" }}
        backdropFilter="saturate(150%) blur(24px)"
        css={{ WebkitBackdropFilter: "saturate(150%) blur(24px)" }}
        borderWidth="1px"
        borderColor={{ base: "whiteAlpha.700", _dark: "whiteAlpha.300" }}
        borderRadius="3xl"
        boxShadow="0 24px 70px rgba(15, 23, 42, 0.28)"
        p={4}
      >
        <HStack justify="space-between" align="start" mb={2}>
          <Box minW={0}>
            <Text fontWeight="semibold">
              {t("store.editor.panel.title", {
                defaultValue: "Store Editor",
              })}
            </Text>
            <StorefrontEditorSessionCountdown
              expiresAt={editorSessionExpiresAt}
            />
          </Box>
          <HStack gap={1}>
            <Badge colorPalette="primary">
              {t("store.editor.panel.preview", {
                defaultValue: "Preview",
              })}
            </Badge>
            <IconButton
              aria-label={t("store.editor.panel.hideEditor", {
                defaultValue: "Hide editing tools",
              })}
              colorPalette="gray"
              size="xs"
              variant="ghost"
              onClick={() => onEditorUiVisibleChange(false)}
            >
              <MaterialSymbol fontSize="1.1rem">visibility_off</MaterialSymbol>
            </IconButton>
          </HStack>
        </HStack>

        <Tabs.Root
          display="flex"
          flexDirection="column"
          minH={0}
          size="sm"
          value={activeTab}
          onValueChange={({ value }) => setActiveTab(value)}
        >
          <Tabs.List>
            <Tabs.Trigger value="section">
              {t("store.editor.panel.tabs.section", {
                defaultValue: "Section",
              })}
            </Tabs.Trigger>
            <Tabs.Trigger value="theme">
              {t("store.editor.panel.tabs.theme", {
                defaultValue: "Theme",
              })}
            </Tabs.Trigger>
            <Tabs.Trigger value="advanced">
              {t("store.editor.panel.tabs.advanced", {
                defaultValue: "Advanced",
              })}
            </Tabs.Trigger>
            <Tabs.Indicator />
          </Tabs.List>
          <Box flex="1" minH={0} overflowY="auto" pt={3}>
            <Tabs.Content p={0} value="section">
              {block ? (
                <StorefrontEditorBlockSection
                  adminCmsUrl={adminCmsUrl}
                  block={block}
                  initialLanguage={lng}
                  onChangeBlock={onChangeBlock}
                />
              ) : (
                <Text color="fg.muted" fontSize="sm">
                  {t("store.editor.panel.noBlockSelected", {
                    defaultValue:
                      "Click a section in the preview to edit it.",
                  })}
                </Text>
              )}
            </Tabs.Content>
            <Tabs.Content p={0} value="theme">
              <StorefrontEditorThemeSection
                onChangeTheme={onChangeTheme}
                theme={theme}
              />
            </Tabs.Content>
            <Tabs.Content p={0} value="advanced">
              <Stack gap={4}>
                <Box
                  borderWidth="1px"
                  borderColor={{ base: "gray.200", _dark: "gray.700" }}
                  borderRadius="2xl"
                  px={3}
                  py={2}
                >
                  <Stack gap={2}>
                    <Switch
                      checked={maintenanceEnabled}
                      colorPalette="orange"
                      disabled={maintenanceSaving}
                      display="flex"
                      flexDirection="row-reverse"
                      fontSize="sm"
                      fontWeight="medium"
                      inputProps={{ "aria-label": maintenanceModeLabel }}
                      justifyContent="space-between"
                      size="sm"
                      w="full"
                      onCheckedChange={({ checked }) =>
                        onMaintenanceEnabledChange(checked)
                      }
                    >
                      {maintenanceModeLabel}
                    </Switch>
                    <Text color="fg.muted" fontSize="xs">
                      {t("store.editor.maintenance.description", {
                        defaultValue:
                          "When enabled, visitors see the maintenance screen while editors can keep previewing this storefront.",
                      })}
                    </Text>
                  </Stack>
                </Box>

                <StorefrontEditorSharingSection
                  onChangeSharing={onChangeSharing}
                  sharing={sharing}
                />

                {revisions.length > 0 ? (
                  <Box
                    borderWidth="1px"
                    borderColor={{ base: "gray.200", _dark: "gray.700" }}
                    borderRadius="2xl"
                    p={3}
                  >
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>
                      {t("store.editor.revisions.title", {
                        defaultValue: "Recent revisions",
                      })}
                    </Text>
                    <VStack align="stretch" gap={2}>
                      {revisions.map((revision) => (
                        <HStack
                          key={revision.id}
                          justify="space-between"
                          gap={2}
                          minH="9"
                        >
                          <Box minW={0}>
                            <HStack gap={1} wrap="wrap">
                              <Badge colorPalette="gray" variant="subtle">
                                {revision.source === "rollback"
                                  ? t("store.editor.revisions.rollback", {
                                      defaultValue: "Rollback",
                                    })
                                  : t("store.editor.revisions.publish", {
                                      defaultValue: "Publish",
                                    })}
                              </Badge>
                              {revision.changedAreas.map((area) => (
                                <Badge
                                  key={area}
                                  colorPalette="primary"
                                  variant="surface"
                                >
                                  {t(`store.editor.revisions.areas.${area}`, {
                                    defaultValue:
                                      area === "home"
                                        ? "Home"
                                        : area === "sharing"
                                          ? "Sharing"
                                          : "Theme",
                                  })}
                                </Badge>
                              ))}
                            </HStack>
                            <Text color="fg.muted" fontSize="xs" truncate>
                              {formatRelativeTime(revision.createdAt, lng) ??
                                revision.id}
                            </Text>
                          </Box>
                          <Button
                            loading={rollingBackRevisionId === revision.id}
                            size="xs"
                            variant="surface"
                            onClick={() => onRollback(revision.id)}
                          >
                            {t("store.editor.actions.rollback", {
                              defaultValue: "Rollback",
                            })}
                          </Button>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                ) : (
                  <Text color="fg.muted" fontSize="sm">
                    {t("store.editor.revisions.empty", {
                      defaultValue: "No published revisions yet.",
                    })}
                  </Text>
                )}
              </Stack>
            </Tabs.Content>
          </Box>
        </Tabs.Root>

        <HStack gap={3} justify="space-between" mt={3}>
          <HStack color="fg.muted" gap={1} minW={0}>
            {autosaveState === "saving" ? (
              <Text fontSize="xs">
                {t("store.editor.autosave.saving", {
                  defaultValue: "Saving…",
                })}
              </Text>
            ) : autosaveState === "saved" ? (
              <>
                <MaterialSymbol fontSize="0.9rem">check</MaterialSymbol>
                <Text fontSize="xs">
                  {t("store.editor.autosave.saved", {
                    defaultValue: "Draft saved",
                  })}
                </Text>
              </>
            ) : autosaveState === "error" ? (
              <Text color="fg.error" fontSize="xs">
                {t("store.editor.autosave.error", {
                  defaultValue: "Autosave failed",
                })}
              </Text>
            ) : (
              <Text fontSize="xs">
                {t("store.editor.autosave.idle", {
                  defaultValue: "Changes save automatically",
                })}
              </Text>
            )}
          </HStack>
          <Button
            colorPalette="primary"
            loading={publishing}
            onClick={onPublish}
          >
            {publishing
              ? t("store.editor.actions.publishing", {
                  defaultValue: "Publishing…",
                })
              : t("store.editor.actions.publish", {
                  defaultValue: "Publish",
                })}
          </Button>
        </HStack>
      </Box>
    </Portal>
  );
}
