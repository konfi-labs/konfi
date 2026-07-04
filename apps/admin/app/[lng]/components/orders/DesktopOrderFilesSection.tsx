"use client";

import { useT } from "@/i18n/client";
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Collapsible,
  HStack,
  IconButton,
  Portal,
  Select,
  Spinner,
  Text,
  TreeView,
  VStack,
  createListCollection,
  createTreeCollection,
} from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol, toaster } from "@konfi/components";
import { OrderItem } from "@konfi/types";
import { ADMIN_DESKTOP_SETTINGS_CHANNELS, isElectron } from "@konfi/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import OrderItemFileUpload from "./OrderItemFileUpload";

interface DesktopOrderFilesSectionProps {
  baseFolderPath?: string;
  orderNumber?: number;
  orderId?: string;
  customerId?: string;
  channelId?: string;
  orderItems?: OrderItem[];
  onUploadComplete?: () => void;
}

interface UploadItemOption {
  value: string;
  label: string;
}

type ElectronOrderApi = NonNullable<Window["konfiDesktop"]>["orders"];
type ElectronOrderFilesResult = Awaited<
  ReturnType<ElectronOrderApi["listOrderFiles"]>
>;
type DesktopOrderFolderNode = NonNullable<
  ElectronOrderFilesResult["tree"]
>[number];
type DesktopOrderFolderFileEntry = NonNullable<
  ElectronOrderFilesResult["files"]
>[number];
type DesktopOrderFolderFileNode = Extract<
  DesktopOrderFolderNode,
  { type: "file" }
>;

type DesktopOrderFilesResult =
  | { status: "not-configured" }
  | { status: "desktop-update-required" }
  | { status: "folder-not-found" }
  | {
      status: "empty";
      files: DesktopOrderFolderFileEntry[];
      tree: DesktopOrderFolderNode[];
    }
  | {
      status: "success";
      files: DesktopOrderFolderFileEntry[];
      tree: DesktopOrderFolderNode[];
    }
  | { status: "error"; message: string };

const getFileName = (filePath: string) =>
  filePath.split(/[/\\]/).filter(Boolean).at(-1) ?? filePath;

export default function DesktopOrderFilesSection({
  baseFolderPath,
  orderNumber,
  orderId,
  customerId,
  channelId,
  orderItems = [],
  onUploadComplete,
}: DesktopOrderFilesSectionProps) {
  const { t, i18n } = useT(["order", "translation"]);
  const [result, setResult] = useState<DesktopOrderFilesResult>({
    status: "not-configured",
  });
  const [loading, setLoading] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [convertingFileIds, setConvertingFileIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedUploadItemId, setSelectedUploadItemId] = useState<
    string | undefined
  >(orderItems[0]?.id);

  const uploadItemOptions = useMemo<UploadItemOption[]>(
    () =>
      orderItems.map((orderItem, index) => ({
        value: orderItem.id,
        label:
          orderItem.product?.name ||
          orderItem.description ||
          t("order.itemFallback", {
            defaultValue: "Item {{index}}",
            index: index + 1,
          }),
      })),
    [orderItems, t],
  );

  const uploadItemCollection = useMemo(
    () => createListCollection({ items: uploadItemOptions }),
    [uploadItemOptions],
  );

  const selectedUploadItem = useMemo(
    () =>
      orderItems.find((orderItem) => orderItem.id === selectedUploadItemId) ??
      orderItems[0],
    [orderItems, selectedUploadItemId],
  );

  useEffect(() => {
    if (
      selectedUploadItemId &&
      orderItems.some((orderItem) => orderItem.id === selectedUploadItemId)
    ) {
      return;
    }

    setSelectedUploadItemId(orderItems[0]?.id);
  }, [orderItems, selectedUploadItemId]);

  const loadFiles = useCallback(async () => {
    if (!isElectron()) {
      return;
    }

    if (!window.konfiDesktop?.orders.listOrderFiles) {
      setResult({ status: "desktop-update-required" });
      return;
    }

    if (!baseFolderPath || orderNumber === undefined || orderNumber === null) {
      setResult({ status: "not-configured" });
      return;
    }

    setLoading(true);
    try {
      const response = await window.konfiDesktop.orders.listOrderFiles({
        baseFolderPath,
        orderNumber,
      });

      if (!response.success) {
        const message =
          response.message ??
          t("order.browserFiles.errorDescription", {
            defaultValue: "The desktop app could not load local order files.",
          });
        if (
          message.includes("ENOENT") ||
          message.toLowerCase().includes("order folder not found") ||
          message.toLowerCase().includes("no such file or directory")
        ) {
          setResult({ status: "folder-not-found" });
          return;
        }

        setResult({
          status: "error",
          message,
        });
        return;
      }

      const files = response.files ?? [];
      const tree = response.tree ?? [];
      setResult({
        status: files.length === 0 ? "empty" : "success",
        files,
        tree,
      });
    } finally {
      setLoading(false);
    }
  }, [baseFolderPath, orderNumber, t]);

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

  const handleOpenFolder = useCallback(
    (relativePath: string) => {
      if (!baseFolderPath || orderNumber === undefined || orderNumber === null) {
        return;
      }
      void window.konfiDesktop?.orders.openContainingFolder({
        baseFolderPath,
        orderNumber,
        relativePath,
      });
    },
    [baseFolderPath, orderNumber],
  );

  const handleFlattenPdf = useCallback(
    async (file: DesktopOrderFolderFileNode) => {
      if (!window.konfiDesktop?.orders.flattenPdf) {
        toaster.error({
          title: t("order.browserFiles.flattenUnavailableTitle", {
            defaultValue: "PDF Conversion Unavailable",
          }),
          description: t("order.browserFiles.flattenUnavailableDescription", {
            defaultValue:
              "Restart the desktop app so it can load PDF conversion tools.",
          }),
        });
        return;
      }
      if (!baseFolderPath || orderNumber === undefined || orderNumber === null) {
        return;
      }

      setConvertingFileIds((current) => new Set(current).add(file.id));
      try {
        const conversionResult = await window.konfiDesktop.orders.flattenPdf({
          baseFolderPath,
          orderNumber,
          relativePath: file.relativePath,
          options: {
            format: "pdf",
            pages: "all",
            density: 300,
          },
        });

        if (!conversionResult.success) {
          toaster.error({
            title: t("order.browserFiles.flattenFailedTitle", {
              defaultValue: "Could Not Flatten PDF",
            }),
            description: conversionResult.message,
          });
          return;
        }

        toaster.success({
          title: t("order.browserFiles.flattenSuccessTitle", {
            defaultValue: "Flattened PDF Created",
          }),
          description: t("order.browserFiles.flattenSuccessDescription", {
            defaultValue: "Saved {{fileName}} in the same folder.",
            fileName: getFileName(conversionResult.files[0] ?? file.path),
          }),
        });
        await loadFiles();
      } catch (error) {
        console.error("Failed to flatten PDF:", error);
        toaster.error({
          title: t("order.browserFiles.flattenFailedTitle", {
            defaultValue: "Could Not Flatten PDF",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("order.browserFiles.flattenFailedDescription", {
                  defaultValue:
                    "The desktop app could not create a flattened PDF.",
                }),
        });
      } finally {
        setConvertingFileIds((current) => {
          const next = new Set(current);
          next.delete(file.id);
          return next;
        });
      }
    },
    [baseFolderPath, loadFiles, orderNumber, t],
  );

  const createFileActions = useCallback(
    (file: DesktopOrderFolderFileNode) => (
      <HStack gap={1}>
        {file.kind === "pdf" && (
          <IconButton
            size="sm"
            variant="ghost"
            loading={convertingFileIds.has(file.id)}
            onClick={(event) => {
              event.stopPropagation();
              void handleFlattenPdf(file);
            }}
            aria-label={t("order.browserFiles.flattenPdf", {
              defaultValue: "Create Flattened PDF",
            })}
          >
            <MaterialSymbol>auto_fix_high</MaterialSymbol>
          </IconButton>
        )}
        <IconButton
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            handleOpenFolder(file.relativePath);
          }}
          aria-label={t("admin.openContainingFolder", {
            defaultValue: "Open containing folder",
          })}
        >
          <MaterialSymbol>folder_open</MaterialSymbol>
        </IconButton>
      </HStack>
    ),
    [convertingFileIds, handleFlattenPdf, handleOpenFolder, t],
  );

  const fileCount =
    result.status === "success" || result.status === "empty"
      ? result.files.length
      : undefined;

  const showUpload = orderItems.length > 0 && selectedUploadItem !== undefined;
  const canUpload =
    Boolean(baseFolderPath) &&
    orderNumber !== undefined &&
    orderNumber !== null &&
    Boolean(orderId) &&
    Boolean(customerId) &&
    Boolean(channelId);

  if (!runtimeReady || !isElectron()) {
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

    if (result.status === "not-configured") {
      return (
        <StateAlert
          status="warning"
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

    if (result.status === "desktop-update-required") {
      return (
        <StateAlert
          status="warning"
          title={t("order.browserFiles.desktopUpdateRequiredTitle", {
            defaultValue: "Desktop Restart Required",
          })}
          description={t(
            "order.browserFiles.desktopUpdateRequiredDescription",
            {
              defaultValue:
                "Restart the desktop app so it can load the local file browser update.",
            },
          )}
        />
      );
    }

    if (result.status === "folder-not-found") {
      return (
        <StateAlert
          status="info"
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

    return (
      <DesktopOrderFilesTree
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
        <Collapsible.Content>
          <VStack pt={2} gap={3} align="stretch">
            {showUpload && (
              <Box
                border="1px solid"
                borderColor="gray.muted"
                borderRadius="2xl"
                p={2}
              >
                <VStack gap={2} align="stretch">
                  <HStack gap={2} align="center">
                    <Text fontSize="xs" fontWeight="600" color="fg.muted">
                      {t("order.browserFiles.uploadToItem", {
                        defaultValue: "Upload to item",
                      })}
                    </Text>
                    <Select.Root
                      collection={uploadItemCollection}
                      value={selectedUploadItemId ? [selectedUploadItemId] : []}
                      onValueChange={({ value }) =>
                        setSelectedUploadItemId(value[0])
                      }
                      aria-label={t("order.browserFiles.uploadToItem", {
                        defaultValue: "Upload to item",
                      })}
                      size="xs"
                      flex={1}
                      minW={0}
                    >
                      <Select.HiddenSelect />
                      <Select.Control flex={1} minW={0}>
                        <Select.Trigger>
                          <Select.ValueText
                            placeholder={t(
                              "order.browserFiles.selectUploadItem",
                              {
                                defaultValue: "Select item",
                              },
                            )}
                          />
                        </Select.Trigger>
                        <Select.IndicatorGroup>
                          <Select.Indicator />
                        </Select.IndicatorGroup>
                      </Select.Control>
                      <Portal>
                        <Select.Positioner>
                          <Select.Content>
                            {uploadItemCollection.items.map((item) => (
                              <Select.Item item={item} key={item.value}>
                                {item.label}
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Portal>
                    </Select.Root>
                  </HStack>
                  {selectedUploadItem && (
                    <OrderItemFileUpload
                      orderItem={selectedUploadItem}
                      orderId={orderId ?? ""}
                      customerId={customerId ?? ""}
                      channelId={channelId ?? ""}
                      orderNumber={orderNumber ?? 0}
                      baseFolderPath={baseFolderPath}
                      disabled={!canUpload}
                      layout="inline"
                      onUploadComplete={() => {
                        void loadFiles();
                        onUploadComplete?.();
                      }}
                    />
                  )}
                </VStack>
              </Box>
            )}
            {renderState()}
          </VStack>
        </Collapsible.Content>
      </Box>
    </Collapsible.Root>
  );
}

function DesktopOrderFilesTree({
  nodes,
  label,
  formatSize,
  formatModifiedDate,
  renderFileActions,
}: {
  nodes: DesktopOrderFolderNode[];
  label: string;
  formatSize: (bytes: number) => string;
  formatModifiedDate: (modified: number) => string;
  renderFileActions: (file: DesktopOrderFolderFileNode) => ReactNode;
}) {
  const collection = useMemo(
    () =>
      createTreeCollection<DesktopOrderFolderNode>({
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
        <TreeView.Node<DesktopOrderFolderNode>
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
