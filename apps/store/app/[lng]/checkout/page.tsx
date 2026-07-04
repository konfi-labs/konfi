import {
  fetchMetadata,
  getAdminDb,
  getStoreRuntimeConfigForRequest,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import {
  Locale,
  type Channel,
  Settings,
  UnitsProofingSettings,
  Warehouse,
} from "@konfi/types";
import {
  serializeFirestore,
  T_STORE_CHECKOUT,
  UNITS_PROOFING_SETTINGS_DOC_ID,
  normalizeUnitsProofingSettings,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import CheckoutPage from "./checkout-page";

function shouldScopeCheckoutWarehouses(tenantContext: TenantContext) {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

async function getSettings(channelId: string, tenantContext: TenantContext) {
  "use cache";
  const scopeWarehouses = shouldScopeCheckoutWarehouses(tenantContext);
  const scopedTenantId = scopeWarehouses ? tenantContext.tenantId : undefined;
  cacheTag("storeSettings", channelId, scopedTenantId ?? "dedicated");
  cacheLife("max");
  if (shouldSkipStaticDataDuringCiBuild()) {
    return {
      settings: undefined,
      warehouses: undefined,
    };
  }

  const adminDb = getAdminDb();
  const [
    buyingSnapshot,
    freeShippingSnapshot,
    shippingSnapshot,
    constructionSnapshot,
    checkoutSnapshot,
    unitsProofingSnapshot,
  ] = await Promise.all([
    adminDb.doc(`channels/${channelId}/settings/buying`).get(),
    adminDb.doc(`channels/${channelId}/settings/freeShipping`).get(),
    adminDb.doc(`channels/${channelId}/settings/shippingOptionsPrices`).get(),
    adminDb.doc(`channels/${channelId}/settings/underConstruction`).get(),
    adminDb.doc(`channels/${channelId}/settings/checkout`).get(),
    adminDb
      .doc(`channels/${channelId}/settings/${UNITS_PROOFING_SETTINGS_DOC_ID}`)
      .get(),
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
  const checkout = checkoutSnapshot.exists
    ? serializeFirestore(
        checkoutSnapshot.data() as NonNullable<Settings["checkout"]>,
      )
    : { invoiceEnabled: true, stockPolicy: "allow" };
  const unitsProofingSettings = unitsProofingSnapshot.exists
    ? serializeFirestore(unitsProofingSnapshot.data() as UnitsProofingSettings)
    : undefined;
  const channelSnapshot = await adminDb
    .collection("channels")
    .doc(channelId)
    .get();
  const channel = channelSnapshot.exists
    ? (channelSnapshot.data() as Channel | undefined)
    : undefined;
  const channelWarehouseIds = Array.isArray(channel?.warehouses)
    ? channel.warehouses.filter(
        (warehouseId): warehouseId is string =>
          typeof warehouseId === "string" && warehouseId.trim().length > 0,
      )
    : [];
  const warehouseSnapshots =
    channelWarehouseIds.length > 0
      ? await adminDb.getAll(
          ...channelWarehouseIds.map((warehouseId) =>
            adminDb.collection("warehouses").doc(warehouseId),
          ),
        )
      : [];
  const warehouses = warehouseSnapshots.flatMap((snapshot) => {
    if (!snapshot.exists) {
      return [];
    }

    const warehouse = snapshot.data() as
      | (Warehouse & { tenantId?: string })
      | undefined;

    if (
      scopeWarehouses &&
      (!scopedTenantId || warehouse?.tenantId !== scopedTenantId)
    ) {
      return [];
    }

    return warehouse ? [serializeFirestore(warehouse) as Warehouse] : [];
  });

  if (
    !buying ||
    !freeShipping ||
    !shippingOptionsPrices ||
    !underConstruction ||
    warehouses.length === 0
  )
    return {
      settings: undefined,
      warehouses: undefined,
    };

  return {
    settings: {
      buying: buying as Settings["buying"],
      freeShipping: freeShipping as Settings["freeShipping"],
      shippingOptionsPrices:
        shippingOptionsPrices as Settings["shippingOptionsPrices"],
      underConstruction: underConstruction as Settings["underConstruction"],
      checkout: checkout as NonNullable<Settings["checkout"]>,
    },
    unitsProofingSettings: normalizeUnitsProofingSettings(
      unitsProofingSettings as Partial<UnitsProofingSettings> | null,
    ),
    warehouses,
  };
}

export default async function Page() {
  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (!runtimeConfig) {
    notFound();
  }

  const { settings, unitsProofingSettings, warehouses } = await getSettings(
    runtimeConfig.channelId,
    runtimeConfig.tenantContext,
  );
  return (
    <CheckoutPage
      settings={settings as Settings | undefined}
      unitsProofingSettings={
        unitsProofingSettings as UnitsProofingSettings | undefined
      }
      warehouses={warehouses as Warehouse[] | undefined}
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
  return await fetchMetadata(T_STORE_CHECKOUT, lng);
}
