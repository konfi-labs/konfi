"use client";

import {
  AspectRatio,
  Box,
  Button,
  Dialog,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Image,
  Input,
  Menu,
  Portal,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  AlertDialog,
  CloseButton,
  MaterialSymbol,
  toaster,
} from "@konfi/components";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  guessMimeTypeFromFileName,
  normalizeMimeType,
} from "@/lib/utils/reference-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SetStateAction } from "react";
import type { TFunction } from "i18next";

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ReferenceLibraryItem = {
  fullPath: string;
  name: string;
  url: string;
  contentType: string;
  timeCreatedMs?: number;
  size?: number;
};

const FINAL_FALLBACK_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="Image unavailable"><rect width="256" height="256" fill="#f2f2f2"/><path d="M64 64l128 128M192 64L64 192" stroke="#c0c0c0" stroke-width="16" stroke-linecap="round"/><text x="128" y="232" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="20" fill="#8a8a8a">Image unavailable</text></svg>',
)}`;

export interface ReferenceImageLibraryDialogProps {
  t: Translate;
  selectedUrls: string[];
  onChangeSelectedUrls: (next: string[]) => void;
  maxSelected: number;
  disabled?: boolean;
  allowedMimeTypes: ReadonlySet<string>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  /** Firebase Storage folder to browse. Defaults to `ai/reference`. */
  rootPath?: string;
}

function getTodayDateStr(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function formatBytes(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0)
    return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function ReferenceImageLibraryDialog({
  t,
  selectedUrls,
  onChangeSelectedUrls,
  maxSelected,
  disabled,
  allowedMimeTypes,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  rootPath = "ai/reference",
}: ReferenceImageLibraryDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (nextOpen: SetStateAction<boolean>) => {
      const resolvedOpen =
        typeof nextOpen === "function" ? nextOpen(open) : nextOpen;

      if (controlledOpen === undefined) {
        setUncontrolledOpen(resolvedOpen);
      }

      onOpenChange?.(resolvedOpen);
    },
    [controlledOpen, onOpenChange, open],
  );

  const [datePrefixes, setDatePrefixes] = useState<string[]>([]);
  const [selectedDatePrefix, setSelectedDatePrefix] = useState<string | null>(
    null,
  );
  const [isLoadingDates, setIsLoadingDates] = useState(false);

  const [items, setItems] = useState<ReferenceLibraryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [search, setSearch] = useState("");

  const [draftSelectedUrls, setDraftSelectedUrls] = useState<string[]>([]);
  const [itemToDelete, setItemToDelete] = useState<ReferenceLibraryItem | null>(
    null,
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const setDeleteConfirmOpen = useCallback(
    (nextOpen: SetStateAction<boolean>) => {
      setShowDeleteConfirm((prevOpen) => {
        const resolvedOpen =
          typeof nextOpen === "function" ? nextOpen(prevOpen) : nextOpen;

        if (!resolvedOpen) {
          setItemToDelete(null);
        }

        return resolvedOpen;
      });
    },
    [],
  );

  const selectedCountLabel = useMemo(() => {
    if (draftSelectedUrls.length <= 0)
      return t("imageGenerator.noSelection", { defaultValue: "No selection" });
    return t("imageGenerator.selectionCount", {
      defaultValue: "Selected: {{count}}",
      count: draftSelectedUrls.length,
    });
  }, [draftSelectedUrls.length, t]);

  const loadDatePrefixes = useCallback(async () => {
    setIsLoadingDates(true);
    try {
      const { ref, listAll } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase/clientApp");

      const result = await listAll(ref(storage, rootPath));
      const prefixes = (result.prefixes ?? [])
        .map((p) => p.name)
        .filter(Boolean);

      // `YYYY-MM-DD` sorts correctly as a string.
      prefixes.sort((a, b) => b.localeCompare(a));

      setDatePrefixes(prefixes);

      const today = getTodayDateStr();
      const initial = prefixes.includes(today) ? today : (prefixes[0] ?? null);
      setSelectedDatePrefix(initial);
    } catch (error) {
      console.error("Failed to list reference folders:", error);
      setDatePrefixes([]);
      setSelectedDatePrefix(null);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("imageGenerator.failedToLoadReferenceLibrary", {
          defaultValue: "Failed to load reference library.",
        }),
      });
    } finally {
      setIsLoadingDates(false);
    }
  }, [rootPath, t]);

  const loadItemsForDate = useCallback(
    async (datePrefix: string) => {
      setIsLoadingItems(true);
      try {
        const { ref, listAll, getDownloadURL, getMetadata } =
          await import("firebase/storage");
        const { storage } = await import("@/lib/firebase/clientApp");

        const folderPath = `${rootPath}/${datePrefix}`;
        const folderRef = ref(storage, folderPath);
        const result = await listAll(folderRef);

        const nextItems = await Promise.all(
          result.items.map(async (item) => {
            const [url, meta] = await Promise.all([
              getDownloadURL(item),
              getMetadata(item),
            ]);

            const contentType = normalizeMimeType(meta.contentType);
            const timeCreatedMs = meta.timeCreated
              ? new Date(meta.timeCreated).getTime()
              : undefined;

            return {
              fullPath: item.fullPath,
              name: item.name,
              url,
              contentType,
              timeCreatedMs,
              size: typeof meta.size === "number" ? meta.size : undefined,
            } satisfies ReferenceLibraryItem;
          }),
        );

        nextItems.sort(
          (a, b) => (b.timeCreatedMs ?? 0) - (a.timeCreatedMs ?? 0),
        );
        setItems(nextItems);
      } catch (error) {
        console.error("Failed to list reference items:", error);
        setItems([]);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("imageGenerator.failedToLoadReferenceImages", {
            defaultValue: "Failed to load reference images.",
          }),
        });
      } finally {
        setIsLoadingItems(false);
      }
    },
    [rootPath, t],
  );

  // When opening: initialize draft selection + load folders.
  useEffect(() => {
    if (!open) return;

    setDraftSelectedUrls(selectedUrls);
    setSearch("");
    void loadDatePrefixes();
  }, [loadDatePrefixes, open, selectedUrls]);

  // When date changes, load items.
  useEffect(() => {
    if (!open) return;
    if (!selectedDatePrefix) {
      setItems([]);
      return;
    }

    void loadItemsForDate(selectedDatePrefix);
  }, [loadItemsForDate, open, selectedDatePrefix]);

  const filteredItems = useMemo(() => {
    return filterLocalFuseItems(items, search, {
      keys: [
        { name: "name", weight: 0.7 },
        { name: "fullPath", weight: 0.3 },
      ],
      threshold: 0.34,
    });
  }, [items, search]);

  const toggleSelection = useCallback(
    (item: ReferenceLibraryItem) => {
      const inferredType =
        item.contentType || guessMimeTypeFromFileName(item.name) || "";
      const supported =
        Boolean(inferredType) && allowedMimeTypes.has(inferredType);

      if (!supported) {
        toaster.warning({
          title: t("common.warning", { defaultValue: "Warning" }),
          description: t("imageGenerator.unsupportedReferenceImageType", {
            defaultValue:
              "This file type is not supported as a reference image.",
          }),
        });
        return;
      }

      setDraftSelectedUrls((prev) => {
        const already = prev.includes(item.url);
        if (already) return prev.filter((u) => u !== item.url);

        if (prev.length >= Math.max(1, maxSelected)) {
          toaster.warning({
            title: t("common.warning", { defaultValue: "Warning" }),
            description: t("imageGenerator.tooManyReferenceImages", {
              defaultValue:
                "You have reached the maximum number of reference images.",
            }),
          });
          return prev;
        }

        return [...prev, item.url];
      });
    },
    [allowedMimeTypes, maxSelected, t],
  );

  const applySelection = useCallback(() => {
    const unique = Array.from(new Set(draftSelectedUrls));
    const limited = unique.slice(0, Math.max(1, maxSelected));

    if (limited.length < unique.length) {
      toaster.warning({
        title: t("common.warning", { defaultValue: "Warning" }),
        description: t("imageGenerator.someFilesSkipped", {
          defaultValue:
            "Some files were skipped because of the attachment limit.",
        }),
      });
    }

    onChangeSelectedUrls(limited);
    setOpen(false);
  }, [draftSelectedUrls, maxSelected, onChangeSelectedUrls, t]);

  const confirmDeleteItem = useCallback(async () => {
    if (!itemToDelete) {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
      return;
    }

    const targetItem = itemToDelete;

    try {
      const { ref, deleteObject } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase/clientApp");
      await deleteObject(ref(storage, targetItem.fullPath));

      setItems((prev) =>
        prev.filter((i) => i.fullPath !== targetItem.fullPath),
      );
      setDraftSelectedUrls((prev) => prev.filter((u) => u !== targetItem.url));

      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("imageGenerator.referenceImageDeleted", {
          defaultValue: "Reference image deleted.",
        }),
      });
    } catch (error) {
      console.error("Failed to delete reference image:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("imageGenerator.failedToDeleteReferenceImage", {
          defaultValue: "Failed to delete reference image.",
        }),
      });
    } finally {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  }, [itemToDelete, t]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      placement="center"
      size="xl"
      scrollBehavior="inside"
      lazyMount
    >
      {!hideTrigger && (
        <Dialog.Trigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label={t("imageGenerator.selectReferenceFromStorage", {
              defaultValue: "Select reference image from storage",
            })}
          >
            <MaterialSymbol>folder_open</MaterialSymbol>
            {t("imageGenerator.selectFromStorage", {
              defaultValue: "Select from storage",
            })}
          </Button>
        </Dialog.Trigger>
      )}

      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            maxW={{ base: "95vw", md: "960px" }}
            maxH="90dvh"
            w="full"
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            <Dialog.Header>
              <VStack align="stretch" gap={2} w="full">
                <HStack gap={2}>
                  <Dialog.Title>
                    {t("imageGenerator.referenceLibrary", {
                      defaultValue: "Reference library",
                    })}
                  </Dialog.Title>
                  <Text fontSize="sm" opacity={0.7} whiteSpace="nowrap">
                    {selectedCountLabel}
                  </Text>
                </HStack>

                <HStack gap={2} flexWrap="wrap" justify="space-between">
                  <HStack gap={2} flexWrap="wrap">
                    <Menu.Root>
                      <Menu.Trigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isLoadingDates}
                        >
                          <MaterialSymbol>event</MaterialSymbol>
                          {selectedDatePrefix
                            ? selectedDatePrefix
                            : t("imageGenerator.chooseDate", {
                                defaultValue: "Choose date",
                              })}
                        </Button>
                      </Menu.Trigger>
                      <Portal>
                        <Menu.Positioner>
                          <Menu.Content>
                            <Menu.ItemGroup>
                              <Menu.ItemGroupLabel>
                                {t("imageGenerator.referenceFolders", {
                                  defaultValue: "Folders",
                                })}
                              </Menu.ItemGroupLabel>
                              {datePrefixes.length === 0 && (
                                <Menu.Item value="none" disabled>
                                  {t("imageGenerator.noReferenceFolders", {
                                    defaultValue: "No folders found",
                                  })}
                                </Menu.Item>
                              )}
                              {datePrefixes.map((prefix) => (
                                <Menu.Item
                                  key={prefix}
                                  value={prefix}
                                  onClick={() => setSelectedDatePrefix(prefix)}
                                >
                                  {prefix}
                                </Menu.Item>
                              ))}
                            </Menu.ItemGroup>
                          </Menu.Content>
                        </Menu.Positioner>
                      </Portal>
                    </Menu.Root>

                    <IconButton
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={t("common.refresh", {
                        defaultValue: "Refresh",
                      })}
                      onClick={() => {
                        void loadDatePrefixes();
                        if (selectedDatePrefix) {
                          void loadItemsForDate(selectedDatePrefix);
                        }
                      }}
                      disabled={isLoadingDates || isLoadingItems}
                    >
                      <MaterialSymbol>refresh</MaterialSymbol>
                    </IconButton>
                  </HStack>

                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("search.placeholder", {
                      defaultValue: "Search...",
                    })}
                    size="sm"
                    maxW={{ base: "full", md: "280px" }}
                    aria-label={t("search.title", { defaultValue: "Search" })}
                  />
                </HStack>
              </VStack>
            </Dialog.Header>

            <Dialog.Body flex={1} minH={0} overflowY="auto">
              <Skeleton loading={isLoadingDates || isLoadingItems}>
                {!selectedDatePrefix ? (
                  <Text opacity={0.7}>
                    {t("imageGenerator.noReferenceFolders", {
                      defaultValue: "No folders found",
                    })}
                  </Text>
                ) : filteredItems.length === 0 ? (
                  <Text opacity={0.7}>
                    {t("imageGenerator.noReferenceImages", {
                      defaultValue: "No images found",
                    })}
                  </Text>
                ) : (
                  <Grid
                    templateColumns={{
                      base: "repeat(2, minmax(0, 1fr))",
                      sm: "repeat(3, minmax(0, 1fr))",
                      md: "repeat(4, minmax(0, 1fr))",
                    }}
                    gap={3}
                  >
                    {filteredItems.map((item) => {
                      const inferredType =
                        item.contentType ||
                        guessMimeTypeFromFileName(item.name) ||
                        "";
                      const supported =
                        Boolean(inferredType) &&
                        allowedMimeTypes.has(inferredType);
                      const selected = draftSelectedUrls.includes(item.url);

                      const label = supported
                        ? t("imageGenerator.toggleReferenceImage", {
                            defaultValue: "Toggle reference image: {{name}}",
                            name: item.name,
                          })
                        : t("imageGenerator.unsupportedReferenceImage", {
                            defaultValue:
                              "Unsupported reference image: {{name}}",
                            name: item.name,
                          });

                      return (
                        <GridItem key={item.fullPath}>
                          <Box position="relative">
                            <IconButton
                              type="button"
                              size="xs"
                              variant="solid"
                              colorPalette="red"
                              aria-label={t("common.delete", {
                                defaultValue: "Delete",
                              })}
                              position="absolute"
                              top={1}
                              right={1}
                              zIndex={2}
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete(item);
                                setShowDeleteConfirm(true);
                              }}
                            >
                              <MaterialSymbol>delete</MaterialSymbol>
                            </IconButton>
                            <Button
                              type="button"
                              w="full"
                              display="flex"
                              flexDirection="column"
                              alignItems="stretch"
                              justifyContent="flex-start"
                              textAlign="start"
                              borderRadius="2xl"
                              overflow="hidden"
                              borderWidth="1px"
                              borderColor={
                                selected ? "primary.solid" : "blackAlpha.200"
                              }
                              bg={selected ? "primary.muted" : "transparent"}
                              cursor={supported ? "pointer" : "not-allowed"}
                              opacity={supported ? 1 : 0.6}
                              aria-label={label}
                              aria-pressed={selected}
                              onClick={() => toggleSelection(item)}
                              p={0}
                              h="auto"
                              minW={0}
                              variant="ghost"
                              _focusVisible={{
                                outline: "2px solid",
                                outlineColor: "primary.500",
                                outlineOffset: "2px",
                              }}
                            >
                              <AspectRatio
                                ratio={1}
                                w="full"
                                bg="blackAlpha.50"
                              >
                                <Box position="relative" w="full" h="full">
                                  <Image
                                    src={item.url}
                                    alt={t("imageGenerator.referenceImageAlt", {
                                      defaultValue: "Reference image",
                                    })}
                                    w="full"
                                    h="full"
                                    objectFit="cover"
                                    display="block"
                                    onError={(e) => {
                                      const img = e.currentTarget;
                                      const stage =
                                        img.dataset.fallbackStage ?? "0";

                                      // 1) Try the local asset fallback.
                                      if (stage === "0") {
                                        img.dataset.fallbackStage = "1";
                                        img.src = "/assets/empty.avif";
                                        return;
                                      }

                                      // 2) If that also fails, use an inline data URI that should always resolve.
                                      // Also detach the error handler to make loops impossible.
                                      if (stage === "1") {
                                        img.dataset.fallbackStage = "2";
                                        img.src = FINAL_FALLBACK_DATA_URI;
                                        img.onerror = null;
                                        return;
                                      }
                                    }}
                                  />
                                  {selected && (
                                    <Box
                                      position="absolute"
                                      left={2}
                                      bottom={2}
                                      borderRadius="full"
                                      bg="primary.solid"
                                      color="white"
                                      px={2}
                                      py={1}
                                      display="inline-flex"
                                      alignItems="center"
                                      gap={1}
                                    >
                                      <MaterialSymbol>check</MaterialSymbol>
                                      <Text fontSize="xs" fontWeight="semibold">
                                        {t("common.selected", {
                                          defaultValue: "Selected",
                                        })}
                                      </Text>
                                    </Box>
                                  )}
                                </Box>
                              </AspectRatio>

                              <VStack align="stretch" gap={0} p={2}>
                                <Text
                                  fontSize="xs"
                                  fontWeight="medium"
                                  truncate
                                  title={item.name}
                                >
                                  {item.name}
                                </Text>
                                <Text
                                  fontSize="2xs"
                                  opacity={0.7}
                                  truncate
                                  title={item.fullPath}
                                >
                                  {item.fullPath}
                                </Text>
                                {(item.size || item.contentType) && (
                                  <Text fontSize="2xs" opacity={0.65}>
                                    {item.contentType || inferredType}
                                    {item.size
                                      ? ` • ${formatBytes(item.size)}`
                                      : ""}
                                  </Text>
                                )}
                              </VStack>
                            </Button>
                          </Box>
                        </GridItem>
                      );
                    })}
                  </Grid>
                )}
              </Skeleton>
            </Dialog.Body>

            <Dialog.Footer justifyContent="space-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>

              <Button
                type="button"
                colorPalette="primary"
                onClick={applySelection}
              >
                <MaterialSymbol>check</MaterialSymbol>
                {t("common.select", { defaultValue: "Select" })}
              </Button>
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <CloseButton />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>

      <AlertDialog
        open={showDeleteConfirm}
        setOpen={setDeleteConfirmOpen}
        header={t("imageGenerator.deleteReferenceImage", {
          defaultValue: "Delete reference image?",
        })}
        handle={confirmDeleteItem}
        t={t as TFunction}
      >
        <Text>
          {t("imageGenerator.deleteReferenceImageConfirm", {
            defaultValue:
              "This will permanently delete this image from storage. This action cannot be undone.",
          })}
        </Text>
      </AlertDialog>
    </Dialog.Root>
  );
}
