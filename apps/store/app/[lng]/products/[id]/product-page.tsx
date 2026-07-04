"use client";

import { useAuth } from "@/context/auth";
import { useCart } from "@/context/cart";
import { useStoreCurrency } from "@/context/currency";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { analytics, firestore } from "@/lib/firebase/clientApp";
import { download } from "@/lib/firebase/storage";
import { Combination, Empty } from "@konfi/components";
import { db, getDoc } from "@konfi/firebase";
import { Attribute, Product, Promotion, Rating } from "@konfi/types";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import React from "react";
import ProductImageGenerationPanel from "./ProductImageGenerationPanel";

interface Props {
  product?: Product;
  attributes?: Attribute[];
  description: string;
  templates?: { name: string; url: string; attributeOptions?: string[] }[];
  ratings?: Rating[];
  ratingsCount: number;
  promotions?: Promotion[];
  expressSettings?: { enabled: boolean; percent: number };
  resolvedChannelId?: string;
  children?: React.ReactNode;
}

function parseOptionalNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const ProductPage = ({
  product,
  attributes,
  description,
  templates,
  ratings,
  ratingsCount,
  promotions,
  expressSettings,
  resolvedChannelId,
  children,
}: Props) => {
  const { t, i18n } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const runtimeConfig = useStoreRuntimeConfig();
  const { user, loginAsGuest, customer } = useAuth();
  const { add, items, upload } = useCart();
  const { selectedCurrencyCode, settings: currencySettings } =
    useStoreCurrency();
  const productChannelId =
    resolvedChannelId ?? product?.channelId ?? runtimeConfig.channelId;
  const addConfiguredItemToCartRef = React.useRef<
    (() => Promise<boolean | string>) | null
  >(null);

  const handleAcceptGeneratedImage = async (files: File[]) => {
    if (!addConfiguredItemToCartRef.current) {
      throw new Error(
        t("products.imageGeneration.errors.addToCartUnavailable", {
          defaultValue:
            "The current product configuration is not ready to be added to cart yet.",
        }),
      );
    }

    const nextCartIndex = items?.length ?? 0;
    const cartItemId = await addConfiguredItemToCartRef.current();

    if (!cartItemId) {
      return;
    }

    await upload(
      nextCartIndex,
      typeof cartItemId === "string" ? cartItemId : nextCartIndex.toString(),
      files,
      parseOptionalNumber(searchParams.get("width")),
      parseOptionalNumber(searchParams.get("height")),
    );
  };

  if (!product)
    return (
      <Empty
        title={t("products.notFoundTitle", {
          defaultValue: "Product not found",
        })}
        description={t("products.notFoundDescription", {
          defaultValue:
            "We couldn't find a product for the provided identifier.",
        })}
        icon="sell"
      />
    );

  return (
    <>
      <Combination
        router={router}
        pathname={pathname}
        params={params}
        searchParams={searchParams}
        product={product}
        attributes={attributes ?? []}
        description={description}
        templates={templates ?? []}
        analytics={analytics}
        channelId={productChannelId}
        firestore={firestore}
        db={db}
        getDoc={getDoc}
        download={download}
        add={add}
        user={user}
        loginAsGuest={loginAsGuest}
        ratings={ratings}
        ratingsCount={ratingsCount}
        promotions={promotions ?? []}
        customerDiscount={
          customer?.linkedProductsIds?.includes(product.id)
            ? 0
            : customer?.discount
        }
        displayCurrency={selectedCurrencyCode}
        currencySettings={currencySettings}
        storeSettings={{ express: expressSettings }}
        inputs={[
          <ProductImageGenerationPanel
            key="ai-image-generation"
            product={product}
            attributes={attributes ?? []}
            channelId={productChannelId}
            presentation="trigger"
            acceptMode="addToCart"
            onAcceptGeneratedImageAction={handleAcceptGeneratedImage}
          />,
        ]}
        registerAddToCartAction={(action) => {
          addConfiguredItemToCartRef.current = action;
        }}
        t={t}
        i18n={i18n}
      />
      {children}
    </>
  );
};

export default ProductPage;
