import { firestore } from "@/lib/firebase/clientApp";
import { db } from "@konfi/firebase";
import { PriceTypeEnum, Product } from "@konfi/types";
import {
  deleteField,
  type DocumentReference,
  getDoc,
  setDoc,
} from "firebase/firestore";

export interface AllegroPublicationSettings {
  defaultStock: number;
  enabled: boolean;
  handlingTime: string;
  impliedWarrantyId: string;
  responsibleProducerId: string;
  returnPolicyId: string;
  safetyInformationDescription: string;
  shippingRatesId: string;
  warrantyId: string;
}

export interface AllegroImportSettings {
  defaultProductId?: string;
  defaultProductName?: string;
  publication?: AllegroPublicationSettings;
}

const ALLEGRO_IMPORT_SETTINGS_DOC_ID = "allegroImport";
export const DEFAULT_ALLEGRO_PUBLICATION_SETTINGS: AllegroPublicationSettings =
  {
    defaultStock: 10,
    enabled: false,
    handlingTime: "P3D",
    impliedWarrantyId: "",
    responsibleProducerId: "",
    returnPolicyId: "",
    safetyInformationDescription: "",
    shippingRatesId: "",
    warrantyId: "",
  };

export function normalizeAllegroPublicationSettings(
  settings: AllegroPublicationSettings | undefined,
): AllegroPublicationSettings {
  return {
    ...DEFAULT_ALLEGRO_PUBLICATION_SETTINGS,
    ...settings,
    handlingTime:
      settings?.handlingTime ??
      DEFAULT_ALLEGRO_PUBLICATION_SETTINGS.handlingTime,
    impliedWarrantyId: settings?.impliedWarrantyId ?? "",
    responsibleProducerId: settings?.responsibleProducerId ?? "",
    returnPolicyId: settings?.returnPolicyId ?? "",
    safetyInformationDescription: settings?.safetyInformationDescription ?? "",
    shippingRatesId: settings?.shippingRatesId ?? "",
    warrantyId: settings?.warrantyId ?? "",
  };
}

export function canUseProductForAllegroImport(
  product?: Pick<Product, "allowCustomPrice" | "priceType"> | null,
): boolean {
  return Boolean(
    product?.allowCustomPrice && product?.priceType === PriceTypeEnum.SINGLE,
  );
}

export function getAllegroImportSettingsRef(
  channelId: string,
): DocumentReference<AllegroImportSettings> {
  return db.doc<AllegroImportSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    ALLEGRO_IMPORT_SETTINGS_DOC_ID,
  );
}

export async function loadAllegroImportSettings(
  channelId: string,
): Promise<AllegroImportSettings | null> {
  const snapshot = await getDoc(getAllegroImportSettingsRef(channelId));
  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() ?? null;
}

export async function saveAllegroImportSettings(
  channelId: string,
  settings: AllegroImportSettings,
): Promise<void> {
  await setDoc(getAllegroImportSettingsRef(channelId), settings, {
    merge: true,
  });
}

export async function clearAllegroImportSettings(
  channelId: string,
): Promise<void> {
  await setDoc(
    getAllegroImportSettingsRef(channelId) as DocumentReference<
      Record<string, unknown>
    >,
    {
      defaultProductId: deleteField(),
      defaultProductName: deleteField(),
    },
    { merge: true },
  );
}

export async function loadAllegroImportDefaultProduct(
  channelId: string,
): Promise<Product | null> {
  const settings = await loadAllegroImportSettings(channelId);
  if (!settings?.defaultProductId) {
    return null;
  }

  const snapshot = await getDoc(
    db.doc<Product>(
      firestore,
      `/channels/${channelId}/products`,
      settings.defaultProductId,
    ),
  );

  if (!snapshot.exists()) {
    return null;
  }

  const product = {
    ...snapshot.data(),
    id: snapshot.id,
  } as Product;

  return canUseProductForAllegroImport(product) ? product : null;
}
