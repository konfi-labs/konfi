"use client";

import { useOrderFolderSettings } from "@/hooks/useOrderFolderSettings";
import { useT } from "@/i18n/client";
import {
  BrowserOrderFileEntry,
  BrowserOrderFolderListResult,
  BrowserOrderFolderNode,
  isBrowserOrderFolderAccessSupported,
  listBrowserOrderFolderFiles,
  openBrowserOrderFolderPicker,
} from "@/lib/order-folder-access";
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Collapsible,
  HStack,
  IconButton,
  Spinner,
  Text,
  TreeView,
  VStack,
  createTreeCollection,
  useBreakpointValue,
} from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol, toaster } from "@konfi/components";
import { ADMIN_DESKTOP_SETTINGS_CHANNELS, isElectron } from "@konfi/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface BrowserOrderFilesSectionProps {
  channelId?: string;
  orderNumber?: number;
}

const revokeObjectUrlLater = (url: string) => {
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export default function BrowserOrderFilesSection({
  channelId,
  orderNumber,
}: BrowserOrderFilesSectionProps) {
  const { t, i18n } = useT(["order", "translation"]);
  const { getConfig, isLoaded } = useOrderFolderSettings();
  const [result, setResult] = useState<BrowserOrderFolderListResult>({
    status: "not-configured",
  });
  const [loading, setLoading] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const isBrowserFilesViewportEnabled =
    useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false;

  const config = useMemo(
    () => (channelId ? getConfig(channelId) : undefined),
    [channelId, getConfig],
  );

  const loadFiles = useCallback(
    async (requestPermission: boolean = false) => {
      if (!isLoaded || isElectron() || !isBrowserFilesViewportEnabled) {
        return;
      }

      if (!channelId || orderNumber === undefined || orderNumber === null) {
        setResult({ status: "not-configured" });
        return;
      }

      setLoading(true);
      try {
        const nextResult = await listBrowserOrderFolderFiles({
          config,
          orderNumber,
          requestPermission,
        });
        setResult(nextResult);
      } finally {
        setLoading(false);
      }
    },
    [channelId, config, isBrowserFilesViewportEnabled, isLoaded, orderNumber],
  );

  useEffect(() => {
    setRuntimeReady(true);
  }, []);

  useEffect(() => {
    if (!runtimeReady) {
      return;
    }
    void loadFiles();
  }, [loadFiles, runtimeReady]);

  const formatSize = useCallback(
    (bytes: number) =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "unit",
        unit: "megabyte",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(bytes / (1024 * 1024)),
    [i18n.resolvedLanguage],
  );

  const formatModifiedDate = useCallback(
    (modified: number) =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(modified)),
    [i18n.resolvedLanguage],
  );

  const handleOpenFile = useCallback(
    async (fileEntry: BrowserOrderFileEntry) => {
      const file = await fileEntry.handle.getFile();
      const url = URL.createObjectURL(file);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (opened) {
        revokeObjectUrlLater(url);
        return;
      }
      URL.revokeObjectURL(url);
    },
    [],
  );

  const handleDownloadFile = useCallback(
    async (fileEntry: BrowserOrderFileEntry) => {
      const file = await fileEntry.handle.getFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileEntry.name;
      link.click();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const getCurrentOrderHandle = useCallback(() => {
    if (result.status === "success" || result.status === "empty") {
      return result.orderHandle;
    }
    return undefined;
  }, [result]);

  const handleOpenSystemPicker = useCallback(async () => {
    const orderHandle = getCurrentOrderHandle();
    if (!orderHandle) {
      return;
    }

    try {
      const status = await openBrowserOrderFolderPicker(orderHandle);
      if (status === "unsupported") {
        toaster.error({
          title: t("order.browserFiles.openPickerUnsupportedTitle", {
            defaultValue: "Picker Unavailable",
          }),
          description: t(
            "order.browserFiles.openPickerUnsupportedDescription",
            {
              defaultValue:
                "This browser cannot open a file picker from the order folder.",
            },
          ),
        });
      }
    } catch (error) {
      console.error("Failed to open order folder picker:", error);
      toaster.error({
        title: t("order.browserFiles.openPickerFailedTitle", {
          defaultValue: "Could Not Open Picker",
        }),
        description: t("order.browserFiles.openPickerFailedDescription", {
          defaultValue:
            "The browser could not open the picker for this order folder.",
        }),
      });
    }
  }, [getCurrentOrderHandle, t]);

  const createFileActions = useCallback(
    (file: BrowserOrderFileEntry) => (
      <HStack gap={1}>
        {(file.kind === "image" || file.kind === "pdf") && (
          <IconButton
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              void handleOpenFile(file);
            }}
            aria-label={t("order.browserFiles.openFile", {
              defaultValue: "Open File",
            })}
          >
            <MaterialSymbol>open_in_new</MaterialSymbol>
          </IconButton>
        )}
        <IconButton
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            void handleDownloadFile(file);
          }}
          aria-label={t("order.browserFiles.downloadFile", {
            defaultValue: "Download File",
          })}
        >
          <MaterialSymbol>download</MaterialSymbol>
        </IconButton>
      </HStack>
    ),
    [handleDownloadFile, handleOpenFile, t],
  );

  const fileCount =
    result.status === "success" || result.status === "empty"
      ? result.files.length
      : undefined;
  const canOpenSystemPicker =
    typeof window !== "undefined" && Boolean(window.showOpenFilePicker);

  if (!runtimeReady || isElectron() || !isBrowserFilesViewportEnabled) {
    return null;
  }

  const renderState = () => {
    if (loading) {
      return (
        <Center py={6}>
          <Spinner size="sm" />
        </Center>
      );
    }

    if (
      !isBrowserOrderFolderAccessSupported() ||
      result.status === "browser-unsupported"
    ) {
      return (
        <StateAlert
          status="warning"
          title={t("order.browserFiles.unsupportedTitle", {
            defaultValue: "Browser Folder Access Unavailable",
          })}
          description={t("order.browserFiles.unsupportedDescription", {
            defaultValue:
              "Use Chrome or the desktop app to browse local order files.",
          })}
        />
      );
    }

    if (result.status === "not-configured") {
      return (
        <StateAlert
          status="info"
          title={t("order.browserFiles.notConfiguredTitle", {
            defaultValue: "Orders Root Not Connected",
          })}
          description={t("order.browserFiles.notConfiguredDescription", {
            defaultValue:
              "Connect an orders root folder in channel settings to browse local files here.",
          })}
          action={
            <ButtonLink
              size="sm"
              variant="outline"
              href={ADMIN_DESKTOP_SETTINGS_CHANNELS}
              ariaLabel={t("order.browserFiles.configureFolder", {
                defaultValue: "Configure Folder",
              })}
            >
              <MaterialSymbol>settings</MaterialSymbol>
              {t("order.browserFiles.configureFolder", {
                defaultValue: "Configure Folder",
              })}
            </ButtonLink>
          }
        />
      );
    }

    if (result.status === "permission-required") {
      return (
        <StateAlert
          status="warning"
          title={t("order.browserFiles.permissionTitle", {
            defaultValue: "Folder Permission Required",
          })}
          description={t("order.browserFiles.permissionDescription", {
            defaultValue:
              "Grant browser access again to list files from this order folder.",
          })}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadFiles(true)}
            >
              <MaterialSymbol>lock_open</MaterialSymbol>
              {t("order.browserFiles.grantAccess", {
                defaultValue: "Grant Access",
              })}
            </Button>
          }
        />
      );
    }

    if (result.status === "folder-not-found") {
      return (
        <StateAlert
          status="warning"
          title={t("order.browserFiles.folderNotFoundTitle", {
            defaultValue: "Order Folder Not Found",
          })}
          description={t("order.browserFiles.folderNotFoundDescription", {
            defaultValue:
              "No direct folder named {{orderNumber}} exists under the connected orders root.",
            orderNumber,
          })}
        />
      );
    }

    if (result.status === "empty") {
      return (
        <StateAlert
          status="info"
          title={t("order.browserFiles.emptyTitle", {
            defaultValue: "Order Folder Is Empty",
          })}
          description={t("order.browserFiles.emptyDescription", {
            defaultValue:
              "The order folder exists, but it does not contain files.",
          })}
        />
      );
    }

    if (result.status === "error") {
      return (
        <StateAlert
          status="error"
          title={t("order.browserFiles.errorTitle", {
            defaultValue: "Could Not Load Local Files",
          })}
          description={result.message}
        />
      );
    }

    if (result.status !== "success") {
      return null;
    }

    return (
      <BrowserOrderFilesTree
        nodes={result.tree}
        label={t("order.browserFiles.title", {
          defaultValue: "Local Order Files",
        })}
        formatSize={formatSize}
        formatModifiedDate={formatModifiedDate}
        renderFileActions={createFileActions}
      />
    );
  };

  return (
    <Collapsible.Root defaultOpen unmountOnExit>
      <Box
        mt={3}
        border="1px solid"
        borderColor="gray.muted"
        borderRadius="3xl"
        p={2}
        className="noprint"
      >
        <HStack justify="space-between" align="center" gap={2}>
          <Collapsible.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              justifyContent="flex-start"
              flex={1}
              minW={0}
              px={2}
            >
              <Collapsible.Indicator
                transition="transform 0.2s"
                _open={{ transform: "rotate(90deg)" }}
              >
                <MaterialSymbol>chevron_right</MaterialSymbol>
              </Collapsible.Indicator>
              <MaterialSymbol>folder</MaterialSymbol>
              <Text as="span" fontWeight="600" truncate>
                {t("order.browserFiles.title", {
                  defaultValue: "Local Order Files",
                })}
              </Text>
              {fileCount !== undefined && (
                <Badge size="sm" variant="subtle">
                  {fileCount}
                </Badge>
              )}
            </Button>
          </Collapsible.Trigger>
          <HStack gap={1}>
            {(result.status === "success" || result.status === "empty") &&
              canOpenSystemPicker && (
                <IconButton
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleOpenSystemPicker()}
                  aria-label={t("order.browserFiles.openPicker", {
                    defaultValue: "Open Picker Here",
                  })}
                >
                  <MaterialSymbol>folder_open</MaterialSymbol>
                </IconButton>
              )}
            <IconButton
              size="sm"
              variant="ghost"
              onClick={() => void loadFiles()}
              aria-label={t("order.browserFiles.refresh", {
                defaultValue: "Refresh Files",
              })}
            >
              <MaterialSymbol>refresh</MaterialSymbol>
            </IconButton>
          </HStack>
        </HStack>
        <Collapsible.Content>
          <Box pt={2}>{renderState()}</Box>
        </Collapsible.Content>
      </Box>
    </Collapsible.Root>
  );
}

function BrowserOrderFilesTree({
  nodes,
  label,
  formatSize,
  formatModifiedDate,
  renderFileActions,
}: {
  nodes: BrowserOrderFolderNode[];
  label: string;
  formatSize: (bytes: number) => string;
  formatModifiedDate: (modified: number) => string;
  renderFileActions: (file: BrowserOrderFileEntry) => ReactNode;
}) {
  const collection = useMemo(
    () =>
      createTreeCollection<BrowserOrderFolderNode>({
        nodeToValue: (node) => node.id,
        nodeToString: (node) => node.name,
        rootNode: {
          id: "ROOT",
          name: "",
          relativePath: "",
          type: "folder",
          children: nodes,
        },
      }),
    [nodes],
  );

  return (
    <TreeView.Root collection={collection} size="xs" animateContent>
      <TreeView.Label srOnly>{label}</TreeView.Label>
      <TreeView.Tree>
        <TreeView.Node<BrowserOrderFolderNode>
          indentGuide={<TreeView.BranchIndentGuide />}
          render={({ node }) =>
            node.type === "folder" ? (
              <TreeView.BranchControl>
                <MaterialSymbol>folder</MaterialSymbol>
                <TreeView.BranchText fontWeight="600">
                  {node.name}
                </TreeView.BranchText>
                <Badge size="sm" variant="subtle" ml={1}>
                  {node.children?.length ?? 0}
                </Badge>
              </TreeView.BranchControl>
            ) : (
              <TreeView.Item>
                <MaterialSymbol color="fg.muted">
                  {node.kind === "image"
                    ? "image"
                    : node.kind === "pdf"
                      ? "picture_as_pdf"
                      : "insert_drive_file"}
                </MaterialSymbol>
                <HStack gap={3} flex={1} minW={0}>
                  <VStack align="start" gap={0} flex={1} minW={0}>
                    <TreeView.ItemText asChild>
                      <Text fontWeight="600" truncate>
                        {node.name}
                      </Text>
                    </TreeView.ItemText>
                    <HStack gap={1.5} color="fg.muted" flexWrap="wrap">
                      <Text fontSize="xs">{formatSize(node.size)}</Text>
                      <Text fontSize="xs">/</Text>
                      <Text fontSize="xs">
                        {formatModifiedDate(node.modified)}
                      </Text>
                      {node.extension && (
                        <Badge size="sm" variant="subtle">
                          {node.extension.toUpperCase()}
                        </Badge>
                      )}
                    </HStack>
                  </VStack>
                  {renderFileActions(node)}
                </HStack>
              </TreeView.Item>
            )
          }
        />
      </TreeView.Tree>
    </TreeView.Root>
  );
}

function StateAlert({
  status,
  title,
  description,
  action,
}: {
  status: "info" | "warning" | "error";
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Alert.Root status={status} p={2}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title fontSize="xs">{title}</Alert.Title>
        <Alert.Description fontSize="xs">{description}</Alert.Description>
      </Alert.Content>
      {action}
    </Alert.Root>
  );
}
