import {
  fetchMetadata,
  getAdminDb,
  getStoreRuntimeConfigForRequest,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import { Locale, Settings } from "@konfi/types";
import { serializeFirestore, T_STORE_CART } from "@konfi/utils";
import { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StorePageContentFallback } from "../components/layout/StoreShellFallback";
import CartPage from "./cart-page";

export const instant = true;

async function getData(channelId: string) {
  "use cache";
  cacheTag("storeSettings", channelId);
  cacheLife("max"); // 24 hours
  if (shouldSkipStaticDataDuringCiBuild()) {
    return {
      settings: undefined,
    };
  }

  const firestore = getAdminDb();
  const [
    buyingSnapshot,
    freeShippingSnapshot,
    shippingSnapshot,
    constructionSnapshot,
  ] = await Promise.all([
    firestore.doc(`channels/${channelId}/settings/buying`).get(),
    firestore.doc(`channels/${channelId}/settings/freeShipping`).get(),
    firestore.doc(`channels/${channelId}/settings/shippingOptionsPrices`).get(),
    firestore.doc(`channels/${channelId}/settings/underConstruction`).get(),
  ]);
  const buying = buyingSnapshot.exists
    ? serializeFirestore(buyingSnapshot.data() as Settings["buying"])
    : undefined;
  const freeShipping = freeShippingSnapshot.exists
    ? serializeFirestore(
        freeShippingSnapshot.data() as Settings["freeShipping"],
      )
    : undefined;
  const shippingOptionsPrices = shippingSnapshot.exists
    ? serializeFirestore(
        shippingSnapshot.data() as Settings["shippingOptionsPrices"],
      )
    : undefined;
  const underConstruction = constructionSnapshot.exists
    ? serializeFirestore(
        constructionSnapshot.data() as Settings["underConstruction"],
      )
    : undefined;

  if (!buying || !freeShipping || !shippingOptionsPrices || !underConstruction)
    return {
      settings: undefined,
    };

  return {
    settings: {
      buying,
      freeShipping,
      shippingOptionsPrices,
      underConstruction,
    },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<StorePageContentFallback variant="cart" />}>
      <CartPageData />
    </Suspense>
  );
}

async function CartPageData() {
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    notFound();
  }

  const { settings } = await getData(runtimeConfig.channelId);
  return (
    <CartPage
      settings={settings ? JSON.parse(JSON.stringify(settings)) : null}
    />
  );
}

type MetadataParams = Promise<{ lng: Locale }>;

export async function generateMetadata({
  params,
}: {
  params: MetadataParams;
}): Promise<Metadata> {
  const { lng } = await params;
  return await fetchMetadata(T_STORE_CART, lng);
}
