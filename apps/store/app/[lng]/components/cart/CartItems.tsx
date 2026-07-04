"use client";

import { useAuth } from "@/context/auth";
import { useCart } from "@/context/cart";
import { useStoreCurrency } from "@/context/currency";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { analytics, storage } from "@/lib/firebase/clientApp";
import { list } from "@/lib/firebase/storage";
import { onFileDelete, onFilePreview } from "@/lib/helpers";
import { fetchProductImageGenerationConfig } from "@/lib/product-image-generation-config";
import {
  Alert,
  Box,
  Button,
  Dialog,
  GridItem,
  HStack,
  IconButton,
  List,
  Presence,
  Portal,
  Separator,
  SimpleGrid,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { FileUploadRootProps } from "@chakra-ui/react";
import {
  CloseButton,
  CustomDialog,
  Image,
  Item,
  MaterialSymbol,
  ProgressBar,
  ProgressRoot,
} from "@konfi/components";
import {
  type CurrencyCode,
  type CurrencySettings,
  ListResults,
  OrderItem,
} from "@konfi/types";
import {
  formatOrderItemAsAnalyticsItem,
  isPreviewAvailable,
} from "@konfi/utils";
import { fetchThumbnail, tenantStoragePaths } from "@konfi/firebase";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { logEvent } from "firebase/analytics";
import { getDownloadURL, getMetadata, ref } from "firebase/storage";
import type { Route } from "next";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FC, useEffect, useMemo, useState } from "react";
import useSWRImmutable from "swr";
import useSWRMutation from "swr/mutation";
import type { ProductImageGenerationPanelProps } from "../../products/[id]/ProductImageGenerationPanel.types";
import {
  buildProductImageGenerationSessionKey,
  getGenerationProgressFromTimestamp,
  useProductImageGenerationSessionState,
} from "../../products/[id]/product-image-generation-session";
import type { Cart3DPreviewProps } from "./Cart3DPreview";

type DropzoneProps = {
  accept: FileUploadRootProps["accept"] | undefined;
  onFilesAccepted: (files: File[]) => void;
};

const Cart3DPreview = dynamic<Cart3DPreviewProps>(
  () => import("./Cart3DPreview").then((m) => m.Cart3DPreview),
  { ssr: false },
);
const Dropzone = dynamic<DropzoneProps>(() => import("../Dropzone"), {
  ssr: false,
});
const ProductImageGenerationPanel = dynamic<ProductImageGenerationPanelProps>(
  () => import("../../products/[id]/ProductImageGenerationPanel"),
  { ssr: false },
);

interface Props {
  minimal?: boolean;
}

const CartItems: FC<Props> = ({ minimal = false }) => {
  const { items, total, shippingPrice } = useCart();
  const {
    selectedCurrency,
    selectedCurrencyCode,
    settings: currencySettings,
    toMajorAmount,
  } = useStoreCurrency();

  useEffect(() => {
    if (!isUndefined(analytics)) {
      const cartValue = Number(
        toMajorAmount(total - shippingPrice).toFixed(
          selectedCurrency.minorUnitDigits,
        ),
      );
      logEvent(analytics, "view_cart", {
        currency: selectedCurrencyCode,
        value: cartValue,
        items: items
          ? items.map((item: OrderItem, index: number) =>
              formatOrderItemAsAnalyticsItem(item, index),
            )
          : [],
      });
      logEvent(analytics, "view_item", {
        currency: selectedCurrencyCode,
        value: cartValue,
        items: items
          ? items.map((item: OrderItem, index: number) =>
              formatOrderItemAsAnalyticsItem(item, index),
            )
          : [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isNull(items)) return null;

  return (
    <VStack
      w={"100%"}
      minW={0}
      align={"stretch"}
      gap={4}
      separator={
        <Separator
          borderColor={{ base: "blackAlpha.200", _dark: "whiteAlpha.200" }}
        />
      }
    >
      {items.map((item, index) => (
        <Presence
          key={index}
          present={true}
          display={"block"}
          w={"100%"}
          animationName={{
            _open: "slide-from-bottom, fade-in",
            _closed: "slide-to-bottom, fade-out",
          }}
          animationDuration="moderate"
        >
          <CartItem
            index={index}
            item={item}
            minimal={minimal}
            displayCurrency={selectedCurrencyCode}
            currencySettings={currencySettings}
          />
        </Presence>
      ))}
    </VStack>
  );
};

const CartItem = ({
  index,
  item,
  minimal = false,
  displayCurrency,
  currencySettings,
}: {
  index: number;
  item: OrderItem;
  minimal?: boolean;
  displayCurrency?: CurrencyCode;
  currencySettings?: CurrencySettings;
}) => {
  const { t, i18n } = useT();
  const [dirtyFlag, setDirtyFlag] = useState(false);
  const { upload, uploaders, remove, preflightJobs } = useCart();
  const { loading: authLoading, user, redirect } = useAuth();
  const tenantContext = useTenantContext();
  const { channelId } = useStoreRuntimeConfig();
  const borderColor = "gray.muted";
  const router = useRouter();
  const {
    data: listResults,
    isMutating,
    trigger,
  } = useSWRMutation(
    !isNull(user) && !isUndefined(user) && !isUndefined(user.uid)
      ? ["cart-item-files", tenantContext.tenantId ?? "", user.uid, item.id]
      : null,
    ([, , userId]) => fetchData(userId),
  );
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showAiGeneration, setShowAiGeneration] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { data: imageGenerationConfig } = useSWRImmutable(
    item.product?.channelId && item.product.id
      ? [
          "product-image-generation-config",
          item.product.channelId,
          item.product.id,
        ]
      : null,
    ([, channelId, productId]) =>
      fetchProductImageGenerationConfig(channelId, productId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const imageGenerationSessionKey = useMemo(
    () =>
      item.product
        ? buildProductImageGenerationSessionKey({
            productId: item.product.id,
            channelId: item.product.channelId,
            width: item.width,
            height: item.height,
            pageCount: item.pageCount ?? undefined,
          })
        : null,
    [item.height, item.pageCount, item.product, item.width],
  );
  const imageGenerationSessionState = useProductImageGenerationSessionState(
    imageGenerationSessionKey ?? "",
  );
  const imageGenerationProgress = getGenerationProgressFromTimestamp(
    imageGenerationSessionState.generationStartedAt,
  );
  const hasGeneratedImageResult = imageGenerationSessionState.result != null;
  const activeUploaders = uploaders.filter(
    (uploader) => uploader.itemId === item.id,
  );
  const activePreflightJobs = preflightJobs.filter(
    (job) =>
      job.itemId === item.id &&
      (job.status === "pending" || job.status === "running"),
  );
  // Once the storage folder listing has resolved (listResults is defined) and is
  // empty — with nothing currently uploading or being preflighted — the item has
  // no attached files. Files live only in Storage (never referenced on the cart
  // document), so an interrupted upload or a refresh mid-upload leaves the item
  // with no artwork; warn the customer so they can re-attach before checkout.
  const hasNoFiles =
    !minimal &&
    !isUndefined(listResults) &&
    isEmpty(listResults) &&
    activeUploaders.length === 0 &&
    activePreflightJobs.length === 0;
  const thumbnailRevision = useMemo(
    () =>
      preflightJobs
        .filter(
          (job) =>
            job.itemId === item.id &&
            job.status === "completed" &&
            job.previewPath,
        )
        .map((job) => `${job.id}:${job.previewPath}`)
        .join("|"),
    [item.id, preflightJobs],
  );

  const redirectToLogin = () => {
    const nextRoute = `${window.location.pathname}${window.location.search}`;
    redirect(nextRoute);
    router.push(`/${i18n.resolvedLanguage ?? "en"}/auth/login` as Route);
  };

  const {
    data: previewURLs,
    isValidating: previewIsValidating,
    mutate,
  } = useSWRImmutable(
    !isUndefined(listResults) && user?.uid
      ? ["thumb", tenantContext.tenantId ?? "", user.uid, item.id]
      : null,
    ([key, , userId, itemId]) => fetchPreviewData(key, userId, itemId),
    { revalidateOnFocus: false },
  );

  const _isPreviewAvailable = useMemo(() => {
    return isPreviewAvailable(item, listResults ?? [], previewURLs ?? []);
  }, [item, listResults, previewURLs]);

  async function fetchPreviewData(
    key: string,
    userId: string,
    itemId: string,
  ): Promise<string[]> {
    try {
      const previewFilePaths = await list(
        key === "thumb"
          ? tenantStoragePaths.cartItemThumbnailFolder(
              tenantContext,
              userId,
              itemId,
            )
          : tenantStoragePaths.cartItemFolder(tenantContext, userId, itemId),
      );
      if (!previewFilePaths) return [];
      const urls: string[] = [];
      const sortedPreviewFilePaths = [...previewFilePaths].sort((left, right) =>
        left.fullPath.localeCompare(right.fullPath),
      );
      for (const previewFilePath of sortedPreviewFilePaths) {
        const previewStorageRef = ref(storage, previewFilePath.fullPath);
        const url = await getDownloadURL(previewStorageRef);
        if (!url) await new Promise((resolve) => setTimeout(resolve, 5000));
        if (url) urls.push(url);
      }
      return urls;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  useEffect(() => {
    trigger();
    mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyFlag]);

  useEffect(
    () => {
      if (uploaders.length > 0) return;
      else {
        trigger();
        mutate();
      }
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [uploaders],
  );

  useEffect(() => {
    const hasCompletedPreflightJob = preflightJobs.some(
      (job) => job.itemId === item.id && job.status === "completed",
    );

    if (!hasCompletedPreflightJob) return;

    trigger();
    mutate();
  }, [item.id, mutate, preflightJobs, trigger]);

  async function fetchData(userId: string) {
    const _listResults: ListResults[] = [];
    try {
      const data = await list(
        tenantStoragePaths.cartItemFolder(tenantContext, userId, item.id),
      );
      if (!isUndefined(data)) {
        await Promise.all(
          data.map(async (result) => {
            if (result.name.includes("thumb_")) return;
            const metadata = await getMetadata(result);
            const newItem = { storageReference: result, metadata };
            _listResults.push(newItem);
          }),
        );
      }
    } catch (error) {
      console.error(error);
    }
    return _listResults;
  }

  async function _onFileDelete(path?: string) {
    if (isUndefined(path)) return;
    try {
      await onFileDelete(path, setDirtyFlag, dirtyFlag);
      const pathFilename = path.substring(
        path.lastIndexOf("/") + 1,
        path.lastIndexOf("."),
      );
      const fileFolderPath = path.substring(0, path.lastIndexOf("/"));
      const tenantCartPathMatch = fileFolderPath.match(
        /^(tenants\/[^/]+)\/carts\/(.+)$/,
      );
      const thumbFilePath = tenantCartPathMatch
        ? `${tenantCartPathMatch[1]}/thumb_carts/${tenantCartPathMatch[2]}/thumb_${pathFilename}.png`
        : `thumb_${fileFolderPath}/thumb_${pathFilename}.png`;
      await onFileDelete(thumbFilePath, setDirtyFlag, dirtyFlag);
    } catch (error) {
      console.error(error);
    }
  }

  if (isUndefined(item.product)) return null;

  return (
    <SimpleGrid
      minH={"0px"}
      w={"100%"}
      columns={minimal ? 1 : { base: 1, lg: 3 }}
      border={"1px solid"}
      borderColor={borderColor}
      borderRadius={"3xl"}
      p={"8"}
      gap={minimal ? 0 : { base: 6, lg: 8 }}
    >
      <GridItem colSpan={minimal ? 1 : { base: 1, lg: 2 }} minW={0}>
        <Item
          item={item}
          channelId={channelId}
          displayCurrency={displayCurrency}
          currencySettings={currencySettings}
          t={t}
          i18n={i18n}
        >
          <CloseButton
            onClick={() =>
              isUndefined(listResults)
                ? remove(item, [])
                : remove(
                    item,
                    listResults.map((result) => result.storageReference),
                  )
            }
            aria-label={t("store.remove", { defaultValue: "Remove" })}
            position={"absolute"}
            top={-2}
            left={-2}
            size={"sm"}
            rounded={"full"}
          />
        </Item>
      </GridItem>
      {!minimal && (
        <GridItem colSpan={1} minW={0}>
          <VStack
            align={{ base: "stretch", lg: "end" }}
            justifyContent={"space-between"}
            h={"100%"}
            gap={4}
          >
            <VStack
              position={"relative"}
              px={"1"}
              py={"1"}
              borderRadius={"full"}
              align={{ base: "stretch", lg: "end" }}
              w={{ base: "100%", lg: "auto" }}
            >
              <HStack w={{ base: "100%", lg: "auto" }} flexWrap="wrap">
                <Button
                  colorPalette={"primary"}
                  onClick={() => setShowFileUpload(true)}
                  w={{ base: "100%", lg: "auto" }}
                >
                  <MaterialSymbol>attach_file</MaterialSymbol>
                  {t("store.attachFiles", { defaultValue: "Attach files" })}
                </Button>
                {item.product && imageGenerationConfig?.enabled ? (
                  <Dialog.Root
                    open={showAiGeneration}
                    onOpenChange={({ open }) => {
                      if (!open) {
                        setShowAiGeneration(false);
                        return;
                      }

                      if (authLoading) {
                        return;
                      }

                      if (!user || user.isAnonymous) {
                        redirectToLogin();
                        return;
                      }

                      setShowAiGeneration(true);
                    }}
                    lazyMount
                    placement="center"
                  >
                    <Dialog.Trigger asChild>
                      <Button variant="ai" w={{ base: "100%", lg: "auto" }}>
                        <MaterialSymbol>auto_awesome</MaterialSymbol>
                        {imageGenerationProgress
                          ? t("products.imageGeneration.cartButtonGenerating", {
                              defaultValue: "Generation in progress",
                            })
                          : hasGeneratedImageResult
                            ? t("products.imageGeneration.cartButtonReview", {
                                defaultValue: "Review generated graphic",
                              })
                            : t("products.imageGeneration.cartButton", {
                                defaultValue: "Generate graphic with AI",
                              })}
                      </Button>
                    </Dialog.Trigger>
                    <Portal>
                      <Dialog.Backdrop />
                      <Dialog.Positioner padding={{ base: 0, md: 4 }}>
                        <Dialog.Content
                          w="100%"
                          maxW={{
                            base: "100vw",
                            md: "calc(100vw - 2rem)",
                            xl: "1200px",
                          }}
                          maxH={{ base: "100dvh", md: "calc(100dvh - 2rem)" }}
                          borderRadius={{ base: undefined, md: "3xl" }}
                          overflow="hidden"
                          p={0}
                          display="flex"
                          flexDirection="column"
                        >
                          <Dialog.CloseTrigger asChild>
                            <CloseButton size="sm" />
                          </Dialog.CloseTrigger>
                          <Dialog.Header pe={12}>
                            <VStack align="stretch" gap={1}>
                              <Dialog.Title textWrap="balance">
                                {t("products.imageGeneration.cartDialogTitle", {
                                  defaultValue:
                                    "Generate and attach final graphic",
                                })}
                              </Dialog.Title>
                            </VStack>
                          </Dialog.Header>
                          <Dialog.Body
                            flex="1"
                            minH={0}
                            pt={0}
                            pb={{ base: 5, md: 6 }}
                            overflowY="auto"
                            overscrollBehavior="contain"
                          >
                            <ProductImageGenerationPanel
                              product={item.product}
                              attributes={[]}
                              channelId={item.product.channelId}
                              imageGenerationConfig={imageGenerationConfig}
                              presentation="inline"
                              width={item.width}
                              height={item.height}
                              pageCount={item.pageCount ?? undefined}
                              onAcceptGeneratedImageAction={async (files) => {
                                await upload(
                                  index,
                                  item.id,
                                  files,
                                  item.width,
                                  item.height,
                                );
                                setShowAiGeneration(false);
                              }}
                            />
                          </Dialog.Body>
                        </Dialog.Content>
                      </Dialog.Positioner>
                    </Portal>
                  </Dialog.Root>
                ) : null}
              </HStack>
              <CustomDialog
                header={t("store.uploadAndAttachFiles", {
                  defaultValue: "Upload and attach files",
                })}
                open={showFileUpload}
                setOpen={setShowFileUpload}
              >
                <Box mb={"4"}>
                  <Alert.Root status="info" borderRadius="2xl" mb={"4"}>
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {t("store.fileRetentionNotice.title", {
                          defaultValue: "Temporary file storage",
                        })}
                      </Alert.Title>
                      <Alert.Description>
                        {t("store.fileRetentionNotice.description", {
                          defaultValue:
                            "We store uploaded files only for the time needed to process your order. If you want to keep them for later use, please download and save them yourself.",
                        })}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                  <Dropzone
                    onFilesAccepted={(files: File[]) =>
                      upload(index, item.id, files, item.width, item.height)
                    }
                    accept={{
                      "application/pdf": [],
                      "image/jpeg": [],
                      "image/png": [],
                      "image/tiff": [],
                    }}
                  />
                  <List.Root mt={"4"} variant={"plain"}>
                    {!isUndefined(listResults) &&
                      listResults.length > 0 &&
                      activeUploaders.length <= 0 &&
                      listResults.map((listResult, listResultIndex) => (
                        <ListResultsItem
                          key={listResultIndex}
                          _onFileDelete={_onFileDelete}
                          listResult={listResult}
                          index={listResultIndex}
                          thumbnailRevision={thumbnailRevision}
                        />
                      ))}
                    {activeUploaders.map((uploader, uploaderIndex) => (
                      <ListResultsItem
                        key={uploader.id}
                        index={uploaderIndex}
                        uploader={uploader}
                      />
                    ))}
                  </List.Root>
                </Box>
              </CustomDialog>
              {_isPreviewAvailable && (
                <Button
                  colorPalette={"primary"}
                  onClick={() => setShowPreview(true)}
                  loading={
                    isUndefined(previewURLs) ||
                    previewIsValidating ||
                    isMutating
                  }
                  w={{ base: "100%", lg: "auto" }}
                >
                  <MaterialSymbol>preview</MaterialSymbol>
                  {t("store.preview3D", { defaultValue: "3D Preview" })}
                </Button>
              )}
              {_isPreviewAvailable && (
                <CustomDialog
                  header={t("store.preview3D", { defaultValue: "3D Preview" })}
                  open={showPreview}
                  setOpen={setShowPreview}
                >
                  <Box height={"500px"} width={"100%"}>
                    {showPreview && previewURLs && (
                      <Cart3DPreview
                        width={item.width ?? 0}
                        height={item.height ?? 0}
                        pageCount={item.pageCount}
                        previewURLs={previewURLs}
                        template={item.product?.threeDModel}
                        fallbackMessage={t("store.preview3DWebGLFallback", {
                          defaultValue:
                            "WebGL is not supported on this device.",
                        })}
                        previousPageLabel={t("store.preview3DPreviousPage", {
                          defaultValue: "Previous",
                        })}
                        nextPageLabel={t("store.preview3DNextPage", {
                          defaultValue: "Next",
                        })}
                        pageLabel={t("store.preview3DPage", {
                          defaultValue: "Page",
                        })}
                      />
                    )}
                  </Box>
                  <Alert.Root status={"info"} size={"sm"} borderRadius="3xl">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {t("store.preview3DInfo", {
                          defaultValue: "3D Preview Information",
                        })}
                      </Alert.Title>
                      <Alert.Description>
                        {t("store.preview3DDescription", {
                          defaultValue:
                            "It is important to note that the 3D preview is rendered at a lower resolution than the final product. This is a recommended approach that allows for faster data processing and smoother operation.",
                        })}
                        <br />
                        {t("store.preview3DDisclaimer", {
                          defaultValue:
                            "The preview is for visual purposes only and is not intended for creating final materials or high-quality documentation.",
                        })}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                </CustomDialog>
              )}
            </VStack>
          </VStack>
        </GridItem>
      )}
      {activeUploaders.length > 0 && !minimal && (
        <GridItem colSpan={{ base: 1, lg: 3 }}>
          <List.Root w={"100%"} variant={"plain"}>
            {activeUploaders.map((uploader, uploaderIndex) => (
              <ListResultsItem
                key={uploader.id}
                index={uploaderIndex}
                uploader={uploader}
              />
            ))}
          </List.Root>
        </GridItem>
      )}
      {activePreflightJobs.length > 0 && (
        <GridItem colSpan={minimal ? 1 : { base: 1, lg: 3 }}>
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("cart.preflightChecking.title", {
                  defaultValue: "Checking uploaded file",
                })}
              </Alert.Title>
              <Alert.Description>
                {t("cart.preflightChecking.description", {
                  count: activePreflightJobs.length,
                  defaultValue:
                    "We are generating the preview and checking print issues in the background.",
                })}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </GridItem>
      )}
      {hasNoFiles && (
        <GridItem colSpan={{ base: 1, lg: 3 }}>
          <Alert.Root status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("cart.missingFiles.title", {
                  defaultValue: "No files attached",
                })}
              </Alert.Title>
              <Alert.Description>
                {t("cart.missingFiles.description", {
                  defaultValue:
                    "This product has no print files attached. Add your artwork before placing the order — and if files disappear after reloading the page, please attach them again.",
                })}
              </Alert.Description>
              <Button
                mt={3}
                size={"sm"}
                colorPalette={"primary"}
                variant={"surface"}
                alignSelf={"start"}
                onClick={() => setShowFileUpload(true)}
              >
                <MaterialSymbol>attach_file</MaterialSymbol>
                {t("cart.missingFiles.action", {
                  defaultValue: "Attach files",
                })}
              </Button>
            </Alert.Content>
          </Alert.Root>
        </GridItem>
      )}
      {!isUndefined(listResults) && !minimal && (
        <GridItem colSpan={{ base: 1, lg: 3 }}>
          <List.Root w={"100%"} variant={"plain"}>
            {listResults.map((listResult, listResultIndex) => (
              <ListResultsItem
                key={listResultIndex}
                _onFileDelete={_onFileDelete}
                listResult={listResult}
                index={listResultIndex}
                thumbnailRevision={thumbnailRevision}
              />
            ))}
          </List.Root>
        </GridItem>
      )}
    </SimpleGrid>
  );
};

const ListResultsItem = ({
  listResult,
  index,
  _onFileDelete,
  uploader,
  thumbnailRevision = "",
}: {
  listResult?: ListResults;
  index: number;
  _onFileDelete?: (path?: string) => void;
  thumbnailRevision?: string;
  uploader?: {
    file: File;
    id: string;
    index: number;
    itemId: string;
    progress: number;
  } | null;
}) => {
  const { t, i18n } = useT();
  const isUploading = !isUndefined(uploader) && !isNull(uploader);
  const uploadProgress = isUploading
    ? Math.max(0, Math.min(100, uploader.progress))
    : 100;
  const fileName = isUploading
    ? uploader.file.name
    : listResult?.storageReference.name;
  const fileSize = isUploading
    ? uploader.file.size
    : (listResult?.metadata?.size ?? 0);
  const { data: _thumbnailURL, isValidating } = useSWRImmutable(
    !isUndefined(listResult) && !uploader
      ? [listResult.storageReference.fullPath, thumbnailRevision, "thumb"]
      : null,
    () => fetchThumbnailData(),
    { revalidateOnFocus: false },
  );

  async function fetchThumbnailData(): Promise<string> {
    if (isUndefined(listResult) || isEmpty(listResult)) return "";
    try {
      return await fetchThumbnail(listResult, storage);
    } catch (error) {
      console.error(error);
      return "";
    }
  }

  return (
    <List.Item
      transitionDuration={"0.3s"}
      transitionDelay={`${index * Number(0.1)}`}
      mt={4}
      gap={2}
      p={4}
      borderRadius="3xl"
      border={"1px solid"}
      borderColor={{ base: "whiteAlpha.400", _dark: "whiteAlpha.200" }}
      bg={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
      shadow={"inset 0 5px 10px 0 rgba(0, 102, 255, 0.1)"}
    >
      <VStack align={"stretch"} gap={3} w={"full"} minW={0}>
        <HStack gap={4} w={"full"} align={"start"} minW={0}>
          {isValidating ? (
            <Skeleton height={"64px"} width={"64px"} borderRadius={"xl"} />
          ) : _thumbnailURL ? (
            <Image
              src={_thumbnailURL}
              alt={""}
              ratio={1}
              objectFit={"contain"}
              minW={"64px"}
              width={64}
              height={64}
              priority={false}
              borderRadius={"xl"}
            />
          ) : (
            <Box
              bgColor={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
              p={"6px"}
              top={"2px"}
              pb={0}
              borderRadius={"md"}
              border={"1px solid"}
              borderColor={{
                base: "blackAlpha.200",
                _dark: "whiteAlpha.200",
              }}
            >
              <MaterialSymbol>insert_drive_file</MaterialSymbol>
            </Box>
          )}
          <VStack gap={0} align={"start"} flex={1} minW={0}>
            <Text fontWeight={"600"} w={"full"} wordBreak={"break-word"}>
              {fileName}
            </Text>
            <Text color={"fg.muted"}>
              {new Intl.NumberFormat(i18n.resolvedLanguage, {
                style: "decimal",
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              }).format(fileSize / (1024 * 1024))}{" "}
              MB
            </Text>
          </VStack>
          {!isUploading && listResult && (
            <HStack ml={"auto"}>
              <IconButton
                variant={"ghost"}
                onClick={() =>
                  onFilePreview(listResult.storageReference.fullPath)
                }
                aria-label={t("common.preview", { defaultValue: "Preview" })}
              >
                <MaterialSymbol>preview</MaterialSymbol>
              </IconButton>
              <IconButton
                variant={"ghost"}
                onClick={() =>
                  !isUndefined(_onFileDelete) &&
                  _onFileDelete(listResult.storageReference.fullPath)
                }
                aria-label={t("common.delete", { defaultValue: "Delete" })}
              >
                <MaterialSymbol>delete</MaterialSymbol>
              </IconButton>
            </HStack>
          )}
        </HStack>
        {isUploading && (
          <HStack ps={{ base: 0, sm: "80px" }} w={"100%"} gap={3}>
            <ProgressRoot
              borderRadius={"full"}
              colorPalette={"primary"}
              size={"md"}
              value={uploadProgress}
              flex={1}
              minW={0}
            >
              <ProgressBar />
            </ProgressRoot>
            <Text color={"fg.muted"} minW={"4ch"} textAlign={"end"}>
              {Math.round(uploadProgress)}%
            </Text>
          </HStack>
        )}
      </VStack>
    </List.Item>
  );
};

export default CartItems;
