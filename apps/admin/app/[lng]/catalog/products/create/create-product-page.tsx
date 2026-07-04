"use client";

import { getExternalProductForCreate } from "@/actions/external-products";
import { getProductAgentDraftForCreate } from "@/actions/product-agent";
import type { ProductPreviewControls } from "@/components/catalog/ProductForm";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { SaasRuntimeOnboarding } from "@/components/onboarding/SaasRuntimeOnboarding";
import { useT } from "@/i18n/client";
import { Alert, Button, Grid, GridItem, Text, VStack } from "@chakra-ui/react";
import { ButtonLink, CustomHeading, MaterialSymbol } from "@konfi/components";
import { Product } from "@konfi/types";
import { ADMIN_CATALOG, ADMIN_CATALOG_PRODUCTS_EDIT } from "@konfi/utils";
import { useChannels } from "context/channels";
import { isNull, isUndefined } from "es-toolkit";
import dynamic from "next/dynamic";
import { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWRImmutable from "swr";
const ProductForm = dynamic(() => import("@/components/catalog/ProductForm"), {
  ssr: false,
});

export async function fetchProduct(id: string | null, channelId?: string) {
  if (isNull(id) || isUndefined(channelId)) return;
  const getDoc = (await import("@konfi/firebase")).getDoc;
  const db = (await import("@konfi/firebase")).db;
  const firestore = (await import("@/lib/firebase/clientApp")).firestore;
  const result = await getDoc(
    db.doc(firestore, `channels/${channelId}/products`, id),
  );
  if (!isUndefined(result)) {
    const product = result as Product;
    return product;
  } else return;
}

async function fetchExternalProduct(
  externalProductId: string | null | undefined,
  categoryId: string | null | undefined,
) {
  if (!externalProductId) return;
  return await getExternalProductForCreate(
    externalProductId,
    categoryId ?? undefined,
  );
}

async function fetchAgentProduct(agentRunId: string | null | undefined) {
  if (!agentRunId) return;
  return getProductAgentDraftForCreate(agentRunId);
}

const CreateProduct = ({
  agentRunId,
  duplicateId,
  externalProductId,
  categoryId,
}: {
  agentRunId?: string;
  duplicateId?: string;
  externalProductId?: string;
  categoryId?: string;
}) => {
  const { t, i18n } = useT(["externalProducts", "translation"]);
  const { channel } = useChannels();
  const router = useRouter();
  const [previewControls, setPreviewControls] =
    useState<ProductPreviewControls | null>(null);

  // Fetch duplicate product
  const { data: duplicateProduct, isValidating: isDuplicateValidating } =
    useSWRImmutable(
      duplicateId ? [duplicateId, channel?.id] : null,
      ([id, channelId]) => fetchProduct(id, channelId),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateOnMount: true,
      },
    );

  // Fetch external product
  const { data: externalProductResult, isValidating: isExternalValidating } =
    useSWRImmutable(
      externalProductId ? [externalProductId, categoryId] : null,
      ([extId, catId]) => fetchExternalProduct(extId, catId),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateOnMount: true,
      },
    );

  const { data: agentProductResult, isValidating: isAgentValidating } =
    useSWRImmutable(
      agentRunId ? ["product-agent-draft", agentRunId] : null,
      ([, currentAgentRunId]) => fetchAgentProduct(currentAgentRunId),
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateOnMount: true,
      },
    );

  const isValidating =
    isDuplicateValidating || isExternalValidating || isAgentValidating;
  const externalProduct =
    externalProductResult?.success && externalProductResult.product
      ? (externalProductResult.product as Product)
      : undefined;
  const agentProduct =
    agentProductResult?.success &&
    agentProductResult.readyForCreate &&
    agentProductResult.product
      ? (agentProductResult.product as Product)
      : undefined;

  const externalProductErrorDescription =
    externalProductResult?.success === false &&
    externalProductResult.duplicateMappingsSummary
      ? t("externalProducts.mappingDuplicateDescription", {
          defaultValue:
            "Each internal attribute can only be mapped once. Resolve duplicates for: {{mappings}}.",
          mappings: externalProductResult.duplicateMappingsSummary,
        })
      : externalProductResult?.success === false
        ? externalProductResult.error
        : undefined;

  const handleProductCreated = (productId: string, channelId: string) => {
    const lng = i18n.resolvedLanguage;
    const target = `/${lng}${ADMIN_CATALOG_PRODUCTS_EDIT}/${productId}?channelId=${channelId}`;
    setTimeout(() => {
      router.push(target as Route);
    }, 600);
  };

  // Determine which product data to use and the form type
  const prefillProduct = duplicateProduct ?? externalProduct ?? agentProduct;
  const formType = duplicateId
    ? "DUPLICATE"
    : externalProductId
      ? "FROM_EXTERNAL"
      : agentRunId
        ? "FROM_AGENT"
        : "CREATE";

  if (isValidating) return <AdminLoadingSkeleton variant="form" rows={8} />;

  return (
    <>
      <CustomHeading
        heading={t("ROUTES.newProduct", { defaultValue: "New Product" })}
        mb="8"
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
        color={"primary.solid"}
      />
      <SaasRuntimeOnboarding intent="product" />
      {externalProductId && (
        <Alert.Root
          status={externalProductResult?.success === false ? "error" : "info"}
          mb={4}
        >
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {externalProductResult?.success === false
                ? t("externalProducts.createFromExternalFailed", {
                    defaultValue: "Couldn't prepare the external product",
                  })
                : t("externalProducts.createFromExternal", {
                    defaultValue: "Creating from external product",
                  })}
            </Alert.Title>
            <Alert.Description>
              {externalProductResult?.success === false
                ? externalProductErrorDescription
                : t("externalProducts.createFromExternalDescription", {
                    defaultValue:
                      "Review and complete the form below. The data has been prefilled from the external source.",
                  })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {agentRunId && (
        <Alert.Root
          status={
            agentProductResult?.success && agentProductResult.readyForCreate
              ? "info"
              : "warning"
          }
          mb={4}
        >
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {agentProductResult?.success && agentProductResult.readyForCreate
                ? t("agents.productDraftReadyTitle", {
                    defaultValue: "Product draft ready",
                  })
                : t("agents.productDraftBlockedTitle", {
                    defaultValue: "Product draft needs review",
                  })}
            </Alert.Title>
            <Alert.Description>
              {agentProductResult?.success && agentProductResult.readyForCreate
                ? t("agents.productDraftReadyDescription", {
                    defaultValue:
                      "Review the prefilled product form below before creating the product.",
                  })
                : agentProductResult?.success === false
                  ? agentProductResult.error
                  : t("agents.productDraftBlockedDescription", {
                      defaultValue:
                        "The agent marked missing or blocked items. Add them first, then continue or rerun the agent.",
                    })}
              {agentProductResult?.blockedItems &&
                agentProductResult.blockedItems.length > 0 && (
                  <VStack align="stretch" gap={1} mt={2}>
                    {agentProductResult.blockedItems.map((item, index) => (
                      <Text
                        key={`${item.type}-${item.label}-${index}`}
                        as="span"
                      >
                        {index + 1}. [blocked] {item.label}: {item.reason}
                      </Text>
                    ))}
                  </VStack>
                )}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {externalProductResult?.success &&
        externalProductResult.warnings &&
        externalProductResult.warnings.length > 0 && (
          <Alert.Root status="warning" mb={4}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("externalProducts.importWarningsTitle", {
                  defaultValue: "Import warnings",
                })}
              </Alert.Title>
              <Alert.Description>
                {externalProductResult.warnings.map((warning, index) => (
                  <span key={index}>
                    {t(
                      `externalProducts.importWarnings.${warning.key}`,
                      warning.params ?? {},
                    )}
                    {index < externalProductResult.warnings!.length - 1 && (
                      <br />
                    )}
                  </span>
                ))}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      <Grid templateColumns="repeat(5, 1fr)" gap="32">
        <GridItem minW={"100%"} colSpan={[5, 5, 5, 3]}>
          {prefillProduct && !isNull(prefillProduct) ? (
            <ProductForm
              product={prefillProduct}
              type={
                formType === "FROM_EXTERNAL" || formType === "FROM_AGENT"
                  ? "DUPLICATE"
                  : formType
              }
              onCreateSuccess={handleProductCreated}
              onPreviewStateChange={setPreviewControls}
              externalProductId={externalProductId}
              duplicateSourceProductId={duplicateId}
            />
          ) : (
            <ProductForm
              type={"CREATE"}
              onCreateSuccess={handleProductCreated}
              onPreviewStateChange={setPreviewControls}
            />
          )}
        </GridItem>
        <GridItem minW={"100%"} colSpan={[5, 5, 5, 2]}>
          <VStack my={"8"} gap={4} alignItems={"stretch"}>
            <ButtonLink
              lng={i18n.resolvedLanguage}
              href={ADMIN_CATALOG}
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
              onClick={() => previewControls?.openPreview()}
              disabled={previewControls?.disabled ?? true}
            >
              <MaterialSymbol>visibility</MaterialSymbol>
              {t("admin.previewProduct", {
                defaultValue: "Preview Product",
              })}
            </Button>
          </VStack>
        </GridItem>
      </Grid>
    </>
  );
};

export default CreateProduct;
