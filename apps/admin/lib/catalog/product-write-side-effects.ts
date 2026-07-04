import "server-only";

import { DEFAULT_LOCALE, type Product } from "@konfi/types";
import { normalizeCurrencyCode } from "@konfi/utils";
import { GoogleAuth } from "google-auth-library";
import { omit } from "es-toolkit";

const googleApiScopes = [
  "https://www.googleapis.com/auth/indexing",
  "https://www.googleapis.com/auth/content",
];

interface PreviousProductState {
  active?: boolean;
  published?: boolean;
  slug?: string;
  id?: string;
}

export interface ProductWriteSideEffectsInput {
  channelId: string;
  productId: string;
  product: Product | null;
  previousProductState?: PreviousProductState;
}

export interface ProductWriteSideEffectsResult {
  skipped: boolean;
  googleIndexingNotified: boolean;
  merchantSynced: boolean;
}

const ignoredProductChangeFields = [
  "prices",
  "allowCustomPrice",
  "recommended",
  "difficulty",
  "shipping",
  "spec",
  "designSpec",
  "productType",
  "priceType",
  "prefferedUnit",
  "keywords",
  "threeDModel",
  "averageRating",
  "linkedChannels",
  "linkedWarehouses",
  "channelId",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
] as const;

function centsToMicros(amountInCents: number): number {
  if (typeof amountInCents !== "number" || Number.isNaN(amountInCents)) {
    throw new Error("Amount must be a valid number");
  }

  if (amountInCents < 0) {
    throw new Error("Amount cannot be negative");
  }

  return Math.round(amountInCents * 10000);
}

function getStoreChannelId() {
  return process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;
}

function getStoreProductUrl(productSlugOrId: string) {
  const storeUrl = process.env.STORE_URL;
  if (!storeUrl) {
    throw new Error("STORE_URL is not configured.");
  }

  return `${storeUrl}/${DEFAULT_LOCALE}/products/${productSlugOrId}`;
}

function getGoogleAuth() {
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;

  if (clientEmail && privateKeyRaw) {
    return new GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKeyRaw.replace(/\\n/gm, "\n"),
      },
      scopes: googleApiScopes,
    });
  }

  return new GoogleAuth({
    scopes: googleApiScopes,
  });
}

async function createProductInputsServiceClient(
  authClient: Awaited<ReturnType<GoogleAuth["getClient"]>>,
) {
  const { ProductInputsServiceClient } = await import(
    "@google-shopping/products"
  );

  return new ProductInputsServiceClient({
    authClient,
  });
}

function shouldSkipUnchangedProduct(
  product: Product,
  previousProduct?: Product,
): boolean {
  if (!previousProduct) {
    return false;
  }

  return (
    JSON.stringify(omit(product, ignoredProductChangeFields)) ===
    JSON.stringify(omit(previousProduct, ignoredProductChangeFields))
  );
}

function resolveProductSlugOrId(
  productId: string,
  product: Product | null,
  previousProductState?: PreviousProductState,
): string {
  return (
    product?.seo.slug ||
    product?.id ||
    previousProductState?.slug ||
    previousProductState?.id ||
    productId
  );
}

function shouldNotifyProductWrite(
  product: Product | null,
  previousProductState?: PreviousProductState,
): boolean {
  if (!product) {
    return true;
  }

  if (
    previousProductState?.active !== undefined &&
    previousProductState.published !== undefined &&
    (!previousProductState.active || !previousProductState.published)
  ) {
    return false;
  }

  return true;
}

export async function syncProductWriteSideEffects({
  channelId,
  productId,
  product,
  previousProductState,
}: ProductWriteSideEffectsInput): Promise<ProductWriteSideEffectsResult> {
  if (channelId !== getStoreChannelId()) {
    return {
      skipped: true,
      googleIndexingNotified: false,
      merchantSynced: false,
    };
  }

  if (!shouldNotifyProductWrite(product, previousProductState)) {
    return {
      skipped: true,
      googleIndexingNotified: false,
      merchantSynced: false,
    };
  }

  const productSlugOrId = resolveProductSlugOrId(
    productId,
    product,
    previousProductState,
  );
  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const type =
    product && product.active && product.availability.published
      ? "URL_UPDATED"
      : "URL_DELETED";

  const response = await client.request({
    url: "https://indexing.googleapis.com/v3/urlNotifications:publish",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      url: getStoreProductUrl(productSlugOrId),
      type,
    },
  });

  if (!response || response.status !== 200) {
    throw new Error(`Invalid Google Indexing response: ${response.status}`);
  }

  let merchantSynced = false;
  if (process.env.MERCHANT_ID && process.env.MERCHANT_DATA_SOURCE) {
    const productsClient = await createProductInputsServiceClient(client);
    const parent = `accounts/${process.env.MERCHANT_ID}`;
    const dataSource = `accounts/${process.env.MERCHANT_ID}/dataSources/${process.env.MERCHANT_DATA_SOURCE}`;

    if (product && type === "URL_UPDATED") {
      const productCurrency =
        normalizeCurrencyCode(product.lowPrice?.currency) ?? "PLN";
      await productsClient.insertProductInput({
        parent,
        dataSource,
        productInput: {
          offerId: product.id,
          contentLanguage: DEFAULT_LOCALE,
          feedLabel: DEFAULT_LOCALE.toUpperCase(),
          productAttributes: {
            title: product.seo.title || product.name,
            description: product.seo.description || "",
            link: getStoreProductUrl(product.seo.slug || product.id),
            imageLink: product.spec.images?.[0]
              ? `https://${process.env.NEXT_PUBLIC_CDN_URL}/channels/${product.channelId || getStoreChannelId()}/products/${product.id}/${product.spec.images[0]}`
              : "",
            additionalImageLinks:
              product.spec.images && product.spec.images.length > 1
                ? product.spec.images
                    .slice(1)
                    .map(
                      (image) =>
                        `https://${process.env.NEXT_PUBLIC_CDN_URL}/channels/${product.channelId || getStoreChannelId()}/products/${product.id}/${image}`,
                    )
                : [],
            availability: "IN_STOCK",
            condition: "NEW",
            googleProductCategory:
              "Business & Industrial > Advertising & Marketing",
            price: {
              amountMicros: product.lowPrice?.value
                ? centsToMicros(product.lowPrice.value)
                : null,
              currencyCode: productCurrency,
            },
            shipping: [
              {
                country: "PL",
                service: "Standardowa wysyłka",
                price: {
                  amountMicros: centsToMicros(3000),
                  currencyCode: productCurrency,
                },
                minHandlingTime: product.lowPrice?.volume?.deliveryTime
                  ? String(product.lowPrice.volume.deliveryTime)
                  : "2",
                maxHandlingTime: product.highPrice?.volume?.deliveryTime
                  ? String(product.highPrice.volume.deliveryTime)
                  : "7",
                minTransitTime: "1",
                maxTransitTime: "5",
              },
            ],
          },
        },
      });
      merchantSynced = true;
    } else {
      await productsClient.deleteProductInput({
        name: `${parent}/productInputs/${DEFAULT_LOCALE}~${DEFAULT_LOCALE.toUpperCase()}~${previousProductState?.id ?? productId}`,
        dataSource,
      });
      merchantSynced = true;
    }
  }

  return {
    skipped: false,
    googleIndexingNotified: true,
    merchantSynced,
  };
}

export { shouldSkipUnchangedProduct };
