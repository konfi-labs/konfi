"use client";

import type { ProductPreviewControls } from "@/components/catalog/ProductForm";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { ProductTranslationForm } from "@/components/catalog/ProductTranslationForm";
import ConnectedExternalProductCard from "@/components/catalog/external-import/ConnectedExternalProductCard";
import { TranslationPanel } from "@/components/translations/TranslationPanel";
import { useT } from "@/i18n/client";
import { auth, firestore } from "@/lib/firebase/clientApp";
import {
  Text,
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  SimpleGrid,
  VStack,
  Wrap,
} from "@chakra-ui/react";
import {
  ButtonLink,
  CustomHeading,
  MaterialSymbol,
  Tag,
  toaster,
} from "@konfi/components";
import { getProductTranslations } from "@konfi/firebase";
import { Product } from "@konfi/types";
import { ADMIN_CATALOG } from "@konfi/utils";
import { useCatalog } from "context/catalog";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetchProduct } from "../../create/create-product-page";
import {
  getProductCostInsights,
  type SerializedProductCostRollup,
} from "@/actions/fakturownia";
const ProductForm = dynamic(() => import("@/components/catalog/ProductForm"));
const ProductTemplates = dynamic(
  () => import("@/components/catalog/ProductTemplates"),
);
const ProductImpositionTemplates = dynamic(
  () => import("@/components/catalog/ProductImpositionTemplates"),
);
const ProductImageGenerationSettings = dynamic(
  () => import("@/components/catalog/ProductImageGenerationSettings"),
);

const CostInsightsCard = ({
  rollup,
  salePriceNet,
}: {
  rollup: SerializedProductCostRollup;
  salePriceNet?: number;
}) => {
  const { t, i18n } = useT();
  const locale = i18n.resolvedLanguage ?? "pl";
  const currency = rollup.baseCurrency || "PLN";

  const formatCurrency = useCallback(
    (value: number | undefined): string => {
      if (value === undefined) {
        return "-";
      }
      return new Intl.NumberFormat(locale, {
        currency,
        style: "currency",
      }).format(value);
    },
    [currency, locale],
  );

  const { overall, byAttributeOption } = rollup;
  const latest = overall.latestUnitCostNetBase;
  const previous = overall.previousUnitCostNetBase;

  const trend = useMemo<"down" | "up" | null>(() => {
    if (latest === undefined || previous === undefined || latest === previous) {
      return null;
    }
    return latest < previous ? "down" : "up";
  }, [latest, previous]);

  const marginPercent = useMemo<number | null>(() => {
    if (salePriceNet === undefined || latest === undefined || salePriceNet <= 0) {
      return null;
    }
    return ((salePriceNet - latest) / salePriceNet) * 100;
  }, [latest, salePriceNet]);

  const variantBuckets = useMemo(
    () => Object.values(byAttributeOption ?? {}).slice(0, 3),
    [byAttributeOption],
  );

  return (
    <Box
      p={6}
      border={"1px solid"}
      borderRadius={"3xl"}
      borderColor="gray.muted"
    >
      <HStack justifyContent="space-between" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          {t("admin.costInsights.title", { defaultValue: "Cost insights" })}
        </Text>
        <MaterialSymbol>insights</MaterialSymbol>
      </HStack>

      <SimpleGrid columns={2} gap={4}>
        <Box>
          <Text fontSize="xs" color="fg.muted">
            {t("admin.costInsights.latestCost", {
              defaultValue: "Latest unit cost (net)",
            })}
          </Text>
          <HStack gap={1}>
            <Text fontSize="md" fontWeight="semibold">
              {formatCurrency(latest)}
            </Text>
            {trend && (
              <MaterialSymbol color={trend === "down" ? "green.500" : "red.500"}>
                {trend === "down" ? "trending_down" : "trending_up"}
              </MaterialSymbol>
            )}
          </HStack>
        </Box>
        <Box>
          <Text fontSize="xs" color="fg.muted">
            {t("admin.costInsights.averageCost", {
              defaultValue: "Average unit cost (net)",
            })}
          </Text>
          <Text fontSize="md" fontWeight="semibold">
            {formatCurrency(overall.averageUnitCostNetBase)}
          </Text>
        </Box>
        <Box>
          <Text fontSize="xs" color="fg.muted">
            {t("admin.costInsights.sampleCount", {
              defaultValue: "Approved samples",
            })}
          </Text>
          <Text fontSize="md" fontWeight="semibold">
            {overall.sampleCount}
          </Text>
        </Box>
        <Box>
          <Text fontSize="xs" color="fg.muted">
            {t("admin.costInsights.latestIssueDate", {
              defaultValue: "Latest invoice date",
            })}
          </Text>
          <Text fontSize="md" fontWeight="semibold">
            {overall.latestIssueDate ?? "-"}
          </Text>
        </Box>
      </SimpleGrid>

      {marginPercent !== null && (
        <Box mt={4}>
          <Text fontSize="xs" color="fg.muted">
            {t("admin.costInsights.grossMargin", {
              defaultValue: "Margin vs latest cost",
            })}
          </Text>
          <Text
            fontSize="md"
            fontWeight="semibold"
            color={marginPercent >= 0 ? "green.500" : "red.500"}
          >
            {marginPercent.toFixed(1)}%
          </Text>
        </Box>
      )}

      {variantBuckets.length > 0 && (
        <Box mt={4}>
          <Text fontSize="xs" color="fg.muted" mb={2}>
            {t("admin.costInsights.byVariant", {
              defaultValue: "Per-variant latest cost",
            })}
          </Text>
          <VStack gap={1} alignItems="stretch">
            {variantBuckets.map((bucket) => (
              <HStack
                key={`${bucket.attributeId ?? ""}:${bucket.optionValue ?? ""}`}
                justifyContent="space-between"
              >
                <Text fontSize="sm" color="fg.muted">
                  {bucket.optionValue ?? "-"}
                </Text>
                <Text fontSize="sm" fontWeight="medium">
                  {formatCurrency(bucket.latestUnitCostNetBase)}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}

      <Text fontSize="xs" color="fg.muted" mt={4}>
        {t("admin.costInsights.disclaimer", {
          defaultValue:
            "Read-only, based on approved supplier invoices (net, PLN).",
        })}
      </Text>
    </Box>
  );
};

const EditProduct = ({ initialChannelId }: { initialChannelId?: string }) => {
  const { t, i18n } = useT();
  const { channel, getChannelById, setChannel } = useChannels();
  const { unlinkProductFromChannel } = useCatalog();
  const { attributes, loadingAttributes } = useConfiguration();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [formControls, setFormControls] =
    useState<ProductPreviewControls | null>(null);
  const [storePreviewOpening, setStorePreviewOpening] = useState(false);

  const channelId = initialChannelId ?? channel?.id;

  useEffect(() => {
    if (!initialChannelId || initialChannelId === channel?.id) {
      return;
    }

    setChannel({ value: initialChannelId });
  }, [channel?.id, initialChannelId, setChannel]);

  const {
    data: product,
    mutate,
    isLoading,
    isValidating,
  } = useSWR(
    id && channelId ? [id, channelId] : null,
    ([_id, _channelId]) => fetchProduct(_id, _channelId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );

  const { data: translations, mutate: mutateTranslations } = useSWR(
    product && channelId ? [product, channelId] : null,
    ([product, channelId]) =>
      getProductTranslations(firestore, channelId, product.id),
  );

  const { data: costInsights } = useSWR(
    product?.id ? ["product-cost-insights", product.id] : null,
    ([, productId]) => getProductCostInsights({ productId }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  async function handleUnlinkProductFromChannel(
    productId: string,
    channelId: string,
  ) {
    await unlinkProductFromChannel(productId, channelId);
    mutate({
      ...product,
      linkedChannels: product?.linkedChannels?.filter((id) => id !== channelId),
    } as Product);
    toaster.success({
      title: "Sukces",
      description: "Produkt został pomyślnie odłączony od kanału",
      duration: 5000,
    });
  }

  const openStorePreview = useCallback(async () => {
    if (!product || !channelId) {
      return;
    }

    const slug = product.seo?.slug?.trim();
    const currentUser = auth.currentUser;

    if (!slug) {
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("error.missingProductSlug", {
          defaultValue: "Product must have an SEO slug before store preview.",
        }),
      });
      return;
    }

    if (!currentUser) {
      toaster.error({
        title: t("auth.noAuthorization", { defaultValue: "No authorization" }),
        description: t("auth.loginRequired", {
          defaultValue: "Sign in as an admin to open store preview.",
        }),
      });
      return;
    }

    let previewWindow: Window | null = null;

    try {
      setStorePreviewOpening(true);
      const productPath = `/${i18n.resolvedLanguage}/products/${encodeURIComponent(slug)}`;
      const productSearchParams = new URLSearchParams({ channelId });
      const redirectPath = `${productPath}?${productSearchParams.toString()}`;
      const previewTarget = `konfi-store-preview-${Date.now()}`;
      previewWindow = window.open("about:blank", previewTarget);

      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.document.title = "Opening preview";
        previewWindow.document.body.innerHTML =
          '<p style="font-family: sans-serif; padding: 16px;">Opening preview…</p>';
      }

      const idToken = await currentUser.getIdToken();

      const previewForm = document.createElement("form");
      previewForm.method = "POST";
      previewForm.action = "/api/store-preview-bridge";
      previewForm.target = previewWindow ? previewTarget : "_self";
      previewForm.style.display = "none";

      for (const [name, value] of Object.entries({
        channelId,
        redirect: redirectPath,
        token: idToken,
      })) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        previewForm.appendChild(input);
      }

      document.body.appendChild(previewForm);
      previewForm.submit();
      previewForm.remove();
    } catch (error) {
      previewWindow?.close();
      console.error("Failed to open store preview", error);
      toaster.error({
        title: t("error.somethingWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("error.storePreviewFailed", {
          defaultValue: "Failed to open store preview.",
        }),
      });
    } finally {
      setStorePreviewOpening(false);
    }
  }, [channelId, i18n.resolvedLanguage, product, t]);

  if (isValidating || isLoading || loadingAttributes) {
    return <AdminLoadingSkeleton variant="form" rows={8} />;
  }

  return (
    <>
      <CustomHeading
        heading={t("admin.editProduct", { defaultValue: "Edit Product" })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Grid
        templateColumns={{ base: "repeat(1, 1fr)", "2xl": "repeat(5, 1fr)" }}
        gap="32"
      >
        <GridItem minW={"100%"} colSpan={{ base: 5, "2xl": 3 }}>
          <ProductForm
            product={product}
            type={"UPDATE"}
            mutate={mutate}
            onPreviewStateChange={setFormControls}
          />
        </GridItem>
        <GridItem minW={"100%"} colSpan={{ base: 5, "2xl": 2 }}>
          <VStack gap={4} alignItems={"stretch"}>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              href={ADMIN_CATALOG}
              mt={8}
              w={"100%"}
              variant={"solid"}
              ariaLabel={t("ROUTES.catalog", { defaultValue: "Catalog" })}
            >
              <MaterialSymbol>arrow_back</MaterialSymbol>
              {t("ROUTES.catalog", { defaultValue: "Catalog" })}
            </ButtonLink>
            <Button
              w={"100%"}
              variant="outline"
              colorPalette="primary"
              onClick={() => formControls?.openPreview()}
              disabled={formControls?.disabled ?? true}
            >
              <MaterialSymbol>visibility</MaterialSymbol>
              {t("admin.previewProduct", {
                defaultValue: "Preview Product",
              })}
            </Button>
            {product && channelId && (
              <Button
                w={"100%"}
                variant="outline"
                colorPalette="primary"
                onClick={openStorePreview}
                disabled={storePreviewOpening}
              >
                <MaterialSymbol>open_in_new</MaterialSymbol>
                {t("admin.previewProductInStore", {
                  defaultValue: "Preview in Store",
                })}
              </Button>
            )}
            {product && channelId && translations && (
              <TranslationPanel
                kind="product"
                source={product}
                translationRef={{
                  kind: "product",
                  channelId,
                  entityId: product.id,
                }}
                translations={translations}
                onMutate={mutateTranslations}
                renderForm={({ locale, translation, type }) => (
                  <ProductTranslationForm
                    key={locale}
                    channelId={channelId}
                    product={product}
                    locale={locale}
                    type={type}
                    translation={translation}
                    mutateTranslations={mutateTranslations}
                  />
                )}
              />
            )}
            {product?.linkedChannels && product.linkedChannels.length > 0 && (
              <Box
                p={6}
                border={"1px solid"}
                borderRadius={"3xl"}
                borderColor="gray.muted"
              >
                <Text fontSize="lg" fontWeight="bold" mb={4}>
                  {t("admin.linkedChannels", {
                    defaultValue: "Linked Channels:",
                  })}
                </Text>
                <Wrap gap={2}>
                  {product.linkedChannels.map((channelId) => (
                    <Tag
                      closable
                      onClose={() =>
                        handleUnlinkProductFromChannel(product.id, channelId)
                      }
                      size="sm"
                      key={channelId}
                    >
                      {getChannelById(channelId)?.name}
                    </Tag>
                  ))}
                </Wrap>
              </Box>
            )}
            {costInsights && costInsights.overall.sampleCount > 0 && (
              <CostInsightsCard
                rollup={costInsights}
                {...(product?.defaultPrice?.value != null
                  ? { salePriceNet: product.defaultPrice.value }
                  : {})}
              />
            )}
            {process.env.NODE_ENV === "development" &&
              product &&
              channelId &&
              attributes && (
                <ConnectedExternalProductCard
                  channelId={channelId}
                  formControls={formControls}
                  product={product}
                  internalAttributes={attributes}
                />
              )}
            {product && channelId && (
              <ProductImageGenerationSettings
                channelId={channelId}
                product={product}
              />
            )}
            {product && channelId && attributes && (
              <ProductImpositionTemplates
                product={product}
                channelId={channelId}
                attributes={attributes}
              />
            )}
            {product && channelId && attributes && (
              <ProductTemplates
                product={product}
                channelId={channelId}
                attributes={attributes}
              />
            )}
          </VStack>
        </GridItem>
      </Grid>
    </>
  );
};

export default EditProduct;
