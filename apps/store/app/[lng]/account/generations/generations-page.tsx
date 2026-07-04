"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  isStoreGeneratedImageExpired,
  type StoreGeneratedImageHistoryEntry,
} from "@/lib/ai/store-image-generation.shared";
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  HStack,
  Image,
  Portal,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  EmptyState,
  MaterialSymbol,
} from "@konfi/components";
import {
  collection,
  DocumentData,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
} from "firebase/firestore";
import {
  getDownloadURL,
  getMetadata,
  listAll,
  ref,
  type StorageReference,
} from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import { storage } from "@/lib/firebase/clientApp";

type StoreGeneratedImageHistoryItem = {
  id: string;
  url: string;
  prompt?: string;
  productId?: string;
  productName?: string;
  model?: string;
  side?: string;
  generatedAt?: string;
  expiresAt?: string;
  pageLabel?: string;
  sizeLabel?: string;
  aspectRatio?: string;
};

type StoreGeneratedImageHistoryPage = {
  items: StoreGeneratedImageHistoryItem[];
  hasMore: boolean;
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
};

const HISTORY_PAGE_SIZE = 24;

function isPermissionDeniedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "permission-denied"
  );
}

function mapHistorySnapshotToItem(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): StoreGeneratedImageHistoryItem | null {
  const data = snapshot.data() as Partial<StoreGeneratedImageHistoryEntry>;
  if (typeof data.url !== "string" || data.url.length === 0) {
    return null;
  }

  const generatedAt =
    typeof data.generatedAt === "string"
      ? data.generatedAt
      : typeof data.generatedAtMs === "number"
        ? new Date(data.generatedAtMs).toISOString()
        : undefined;
  const expiresAt =
    typeof data.expiresAt === "string"
      ? data.expiresAt
      : typeof data.expiresAtMs === "number"
        ? new Date(data.expiresAtMs).toISOString()
        : undefined;

  if (
    isStoreGeneratedImageExpired({
      expiresAt,
      generatedAt,
    })
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    url: data.url,
    prompt: data.prompt,
    productId: data.productId,
    productName: data.productName,
    model: data.model,
    side: data.side,
    generatedAt,
    expiresAt,
    pageLabel: data.pageLabel,
    sizeLabel: data.sizeLabel,
    aspectRatio: data.aspectRatio,
  };
}

async function loadStoreGeneratedImagesPage(params: {
  userId: string;
  lastVisible?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<StoreGeneratedImageHistoryPage> {
  if (!firestore) {
    throw new Error("Firestore is not initialized.");
  }

  const constraints = [
    orderBy("generatedAtMs", "desc"),
    limit(HISTORY_PAGE_SIZE),
  ];
  const generationsQuery = params.lastVisible
    ? query(
        collection(firestore, "users", params.userId, "imageGenerations"),
        ...constraints,
        startAfter(params.lastVisible),
      )
    : query(
        collection(firestore, "users", params.userId, "imageGenerations"),
        ...constraints,
      );
  const snapshot = await getDocs(generationsQuery);
  const items = snapshot.docs.flatMap((docSnapshot) => {
    const item = mapHistorySnapshotToItem(docSnapshot);
    return item ? [item] : [];
  });

  return {
    items,
    hasMore: snapshot.docs.length === HISTORY_PAGE_SIZE,
    lastVisible: snapshot.docs.at(-1) ?? null,
  };
}

async function listStorageItemsRecursively(
  path: string,
): Promise<StorageReference[]> {
  const listing = await listAll(ref(storage, path));
  const nestedItems = await Promise.all(
    listing.prefixes.map((prefix) => listStorageItemsRecursively(prefix.fullPath)),
  );

  return [...listing.items, ...nestedItems.flat()];
}

async function loadLegacyStoreGeneratedImages(
  userId: string,
): Promise<StoreGeneratedImageHistoryItem[]> {
  const items = await listStorageItemsRecursively(`ai/generated/users/${userId}`);
  const images = await Promise.all(
    items.map(async (item) => {
      const [metadata, url] = await Promise.all([
        getMetadata(item),
        getDownloadURL(item),
      ]);
      const customMetadata = metadata.customMetadata ?? {};

      const generatedAt = customMetadata.generatedAt ?? metadata.timeCreated;
      const expiresAt = customMetadata.expiresAt;

      if (
        isStoreGeneratedImageExpired({
          expiresAt,
          generatedAt,
        })
      ) {
        return null;
      }

      return {
        id: item.fullPath,
        url,
        prompt: customMetadata.prompt,
        productId: customMetadata.productId,
        productName: customMetadata.productName,
        model: customMetadata.model,
        side: customMetadata.side,
        generatedAt,
        expiresAt,
        pageLabel: customMetadata.pageLabel,
        sizeLabel: customMetadata.sizeLabel,
        aspectRatio: customMetadata.aspectRatio,
      } satisfies StoreGeneratedImageHistoryItem;
    }),
  );

  return images
    .flatMap((image) => (image ? [image] : []))
    .toSorted((left, right) => {
      const leftTime = left.generatedAt ? Date.parse(left.generatedAt) : 0;
      const rightTime = right.generatedAt ? Date.parse(right.generatedAt) : 0;
      return rightTime - leftTime;
    });
}

function downloadGeneratedImage(item: StoreGeneratedImageHistoryItem) {
  const link = document.createElement("a");
  const fileName = `${item.productId ?? "generated"}-${item.side ?? "image"}.png`;
  link.href = item.url;
  link.download = fileName;
  link.rel = "noopener";
  link.click();
}

export default function GenerationsPage() {
  const { t, i18n } = useT();
  const { user } = useAuth();
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [items, setItems] = useState<StoreGeneratedImageHistoryItem[]>([]);
  const [lastVisible, setLastVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [previewItem, setPreviewItem] =
    useState<StoreGeneratedImageHistoryItem | null>(null);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.resolvedLanguage],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitialPage() {
      if (!user?.uid) {
        setError(null);
        setHasMore(false);
        setItems([]);
        setLastVisible(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const page = await loadStoreGeneratedImagesPage({ userId: user.uid });
        if (cancelled) {
          return;
        }

        setItems(page.items);
        setHasMore(page.hasMore);
        setLastVisible(page.lastVisible);
      } catch (loadError) {
        if (isPermissionDeniedError(loadError)) {
          console.warn(
            "Falling back to storage-backed generation history because Firestore permissions are missing.",
            loadError,
          );
          try {
            const legacyItems = await loadLegacyStoreGeneratedImages(user.uid);
            if (cancelled) {
              return;
            }

            setItems(legacyItems);
            setHasMore(false);
            setLastVisible(null);
            return;
          } catch (legacyLoadError) {
            console.error(
              "Failed to load generated image history from Storage fallback:",
              legacyLoadError,
            );
            if (cancelled) {
              return;
            }

            setError(
              legacyLoadError instanceof Error
                ? legacyLoadError
                : new Error("Failed to load image generation history."),
            );
            setItems([]);
            setHasMore(false);
            setLastVisible(null);
            return;
          }
        }

        console.error("Failed to load generated image history:", loadError);
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError
            : new Error("Failed to load image generation history."),
        );
        setItems([]);
        setHasMore(false);
        setLastVisible(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialPage();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  async function handleLoadMore() {
    if (!user?.uid || !lastVisible || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await loadStoreGeneratedImagesPage({
        userId: user.uid,
        lastVisible,
      });
      setItems((currentItems) => [...currentItems, ...page.items]);
      setHasMore(page.hasMore);
      setLastVisible(page.lastVisible);
    } catch (loadError) {
      console.error("Failed to load more generated images:", loadError);
      setError(
        loadError instanceof Error
          ? loadError
          : new Error("Failed to load more image generation history."),
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <>
      <CustomHeading
        heading={t("account.generations.title", {
          defaultValue: "AI generations",
        })}
        mb="8"
      />
      <VStack align="stretch" gap="6">
        <Text color="fg.muted" maxW="3xl">
          {t("account.generations.description", {
            defaultValue:
              "Review the graphics you generated, reopen them in full size, and download the final files again whenever you need them.",
          })}
        </Text>

        {isLoading ? (
          <Box
            borderWidth="1px"
            borderRadius="3xl"
            p="10"
            display="flex"
            justifyContent="center"
          >
            <Spinner size="lg" />
          </Box>
        ) : error ? (
          <Card.Root borderRadius="3xl" variant="outline">
            <Card.Body>
              <Text>
                {t("account.generations.loadError", {
                  defaultValue:
                    "We couldn't load your saved AI generations right now.",
                })}
              </Text>
            </Card.Body>
          </Card.Root>
        ) : items.length > 0 ? (
          <VStack align="stretch" gap="6">
            <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="6">
              {items.map((item) => (
                <Card.Root
                  key={item.id}
                  overflow="hidden"
                  borderRadius="3xl"
                  variant="outline"
                >
                  <Box
                    bg="bg.muted"
                    cursor="pointer"
                    onClick={() => setPreviewItem(item)}
                  >
                    <Image
                      src={item.url}
                      alt={
                        item.productName ??
                        t("account.generations.unnamedProduct", {
                          defaultValue: "Generated graphic",
                        })
                      }
                      aspectRatio={1}
                      objectFit="cover"
                      w="100%"
                    />
                  </Box>
                  <Card.Body>
                    <VStack align="stretch" gap="4">
                      <HStack justify="space-between" align="start" gap="3">
                        <VStack align="stretch" gap="1" flex="1">
                          <Text fontWeight="semibold" lineClamp={2}>
                            {item.productName ??
                              t("account.generations.unnamedProduct", {
                                defaultValue: "Generated graphic",
                              })}
                          </Text>
                          <Text color="fg.muted" fontSize="sm">
                            {item.generatedAt
                              ? formatter.format(new Date(item.generatedAt))
                              : t("account.generations.unknownDate", {
                                  defaultValue: "Unknown date",
                                })}
                          </Text>
                        </VStack>
                        {item.side ? (
                          <Badge borderRadius="full">
                            {item.side === "front"
                              ? t("products.imageGeneration.sides.front", {
                                  defaultValue: "Front side",
                                })
                              : item.side === "back"
                                ? t("products.imageGeneration.sides.back", {
                                    defaultValue: "Back side",
                                  })
                                : t("account.generations.singleSide", {
                                    defaultValue: "Single side",
                                  })}
                          </Badge>
                        ) : null}
                      </HStack>

                      <HStack wrap="wrap" gap="2">
                        {item.sizeLabel ? (
                          <Badge variant="subtle" borderRadius="full">
                            {item.sizeLabel}
                          </Badge>
                        ) : null}
                        {item.pageLabel ? (
                          <Badge variant="subtle" borderRadius="full">
                            {item.pageLabel}
                          </Badge>
                        ) : null}
                        {item.model ? (
                          <Badge variant="subtle" borderRadius="full">
                            {item.model}
                          </Badge>
                        ) : null}
                      </HStack>

                      {item.prompt ? (
                        <Text color="fg.muted" fontSize="sm" lineClamp={4}>
                          {item.prompt}
                        </Text>
                      ) : null}
                    </VStack>
                  </Card.Body>
                  <Card.Footer pt="0">
                    <HStack w="full" gap="3">
                      <Button
                        flex="1"
                        variant="outline"
                        borderRadius="full"
                        onClick={() => setPreviewItem(item)}
                      >
                        <MaterialSymbol>visibility</MaterialSymbol>
                        {t("account.generations.previewButton", {
                          defaultValue: "Preview",
                        })}
                      </Button>
                      <Button
                        flex="1"
                        colorPalette="primary"
                        borderRadius="full"
                        onClick={() => downloadGeneratedImage(item)}
                      >
                        <MaterialSymbol>download</MaterialSymbol>
                        {t("account.generations.downloadButton", {
                          defaultValue: "Download",
                        })}
                      </Button>
                    </HStack>
                  </Card.Footer>
                </Card.Root>
              ))}
            </SimpleGrid>
            {hasMore ? (
              <HStack justify="center">
                <Button
                  variant="outline"
                  borderRadius="full"
                  loading={isLoadingMore}
                  onClick={() => void handleLoadMore()}
                >
                  {t("account.generations.loadMoreButton", {
                    defaultValue: "Load more",
                  })}
                </Button>
              </HStack>
            ) : null}
          </VStack>
        ) : (
          <EmptyState
            icon={<MaterialSymbol>auto_awesome</MaterialSymbol>}
            title={t("account.generations.emptyTitle", {
              defaultValue: "No saved generations yet",
            })}
            description={t("account.generations.emptyDescription", {
              defaultValue:
                "Generated graphics from the product page and cart will appear here after they finish.",
            })}
          />
        )}
      </VStack>

      <Dialog.Root
        lazyMount
        open={previewItem != null}
        onOpenChange={({ open }) => {
          if (!open) {
            setPreviewItem(null);
          }
        }}
        size="xl"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner p={{ base: 4, md: 8 }}>
            <Dialog.Content borderRadius="3xl" overflow="hidden">
              <Dialog.Header>
                <Dialog.Title>
                  {previewItem?.productName ??
                    t("account.generations.previewTitle", {
                      defaultValue: "Generated graphic preview",
                    })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <VStack align="stretch" gap="5">
                  {previewItem ? (
                    <Image
                      src={previewItem.url}
                      alt={
                        previewItem.productName ??
                        t("account.generations.unnamedProduct", {
                          defaultValue: "Generated graphic",
                        })
                      }
                      borderRadius="2xl"
                      objectFit="contain"
                      maxH="70vh"
                      w="100%"
                    />
                  ) : null}
                  <VStack align="stretch" gap="2">
                    {previewItem?.generatedAt ? (
                      <Text color="fg.muted" fontSize="sm">
                        {formatter.format(new Date(previewItem.generatedAt))}
                      </Text>
                    ) : null}
                    {previewItem?.prompt ? <Text>{previewItem.prompt}</Text> : null}
                  </VStack>
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <HStack w="full" justify="end">
                  <Button
                    variant="outline"
                    borderRadius="full"
                    onClick={() => setPreviewItem(null)}
                  >
                    {t("common.close", { defaultValue: "Close" })}
                  </Button>
                  {previewItem ? (
                    <Button
                      colorPalette="primary"
                      borderRadius="full"
                      onClick={() => downloadGeneratedImage(previewItem)}
                    >
                      <MaterialSymbol>download</MaterialSymbol>
                      {t("account.generations.downloadButton", {
                        defaultValue: "Download",
                      })}
                    </Button>
                  ) : null}
                </HStack>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
