import { firestore } from "@/lib/firebase/clientApp";
import {
  type AllegroCategorySuggestion,
  type AllegroExportConfigurationSelection,
  type AllegroExportParameterMapping,
  type AllegroExportPreviewOffer,
} from "@/lib/allegro-export-preview";
import { db } from "@konfi/firebase";
import { Product } from "@konfi/types";
import {
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  type DocumentReference,
} from "firebase/firestore";

const ALLEGRO_EXPORT_OFFER_DOC_PREFIX = "allegroExportOffer";
const ALLEGRO_EXPORT_OFFER_KIND = "allegroExportOffer";

export type AllegroExportStoredOfferStatus = "draft" | "published";

export interface AllegroExportStoredOffer {
  allegroOfferId?: string | null;
  calculatedCombination: string;
  categoryId: string;
  categoryName?: string | null;
  categoryPath: string[];
  channelId: string;
  combination: string;
  combinationDescription: string;
  configurationId: string;
  createdAt: Timestamp;
  fingerprint: string;
  formattedPrice?: string;
  id: string;
  kind: typeof ALLEGRO_EXPORT_OFFER_KIND;
  mappings: AllegroExportParameterMapping[];
  priceAmountMinor?: number;
  priceError?: string;
  productId: string;
  productName: string;
  publicationStatus?: string | null;
  productUpdatedAt?: Product["updatedAt"];
  selection: AllegroExportConfigurationSelection;
  status: AllegroExportStoredOfferStatus;
  title: string;
  updatedAt: Timestamp;
  warnings: string[];
}

export interface AllegroExportStoredOfferInput {
  calculatedCombination: string;
  categoryId: string;
  categoryParametersLoaded: boolean;
  combination: string;
  combinationDescription: string;
  formattedPrice?: string;
  priceAmountMinor?: number;
  priceError?: string;
  product: Product;
  publicationStatus?: string | null;
  previewOffer: AllegroExportPreviewOffer;
  selectedCategory: AllegroCategorySuggestion | null;
  selection: AllegroExportConfigurationSelection;
  status?: AllegroExportStoredOfferStatus;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function normalizeDocumentIdPart(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "item"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAllegroExportStoredOffer(
  value: unknown,
): value is AllegroExportStoredOffer {
  return (
    isObject(value) &&
    value.kind === ALLEGRO_EXPORT_OFFER_KIND &&
    typeof value.categoryId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.id === "string" &&
    typeof value.productId === "string" &&
    typeof value.title === "string" &&
    isObject(value.selection)
  );
}

export function buildAllegroExportStoredOfferId(options: {
  categoryId: string;
  productId: string;
  selectionId: string;
}): string {
  return [
    ALLEGRO_EXPORT_OFFER_DOC_PREFIX,
    normalizeDocumentIdPart(options.productId),
    normalizeDocumentIdPart(options.categoryId),
    hashString(options.selectionId),
  ].join("_");
}

export function getAllegroExportOffersCollectionPath(channelId: string) {
  return `/channels/${channelId}/settings`;
}

export function getAllegroExportOfferRef(
  channelId: string,
  offerId: string,
): DocumentReference<AllegroExportStoredOffer> {
  return db.doc<AllegroExportStoredOffer>(
    firestore,
    getAllegroExportOffersCollectionPath(channelId),
    offerId,
  );
}

export function createAllegroExportStoredOfferData(options: {
  channelId: string;
  input: AllegroExportStoredOfferInput;
  now: Timestamp;
  previousCreatedAt?: Timestamp;
}): AllegroExportStoredOffer {
  const id = buildAllegroExportStoredOfferId({
    categoryId: options.input.categoryId,
    productId: options.input.product.id,
    selectionId: options.input.selection.id,
  });

  return {
    calculatedCombination: options.input.calculatedCombination,
    categoryId: options.input.categoryId,
    categoryName: options.input.selectedCategory?.name ?? null,
    categoryPath: options.input.selectedCategory?.path ?? [],
    channelId: options.channelId,
    combination: options.input.combination,
    combinationDescription: options.input.combinationDescription,
    configurationId: options.input.selection.id,
    createdAt: options.previousCreatedAt ?? options.now,
    fingerprint: options.input.previewOffer.fingerprint,
    id,
    kind: ALLEGRO_EXPORT_OFFER_KIND,
    mappings: options.input.categoryParametersLoaded
      ? options.input.previewOffer.mappings
      : [],
    productId: options.input.product.id,
    productName: options.input.product.name,
    publicationStatus: options.input.publicationStatus ?? null,
    selection: options.input.selection,
    status: options.input.status ?? "draft",
    title: options.input.previewOffer.title,
    updatedAt: options.now,
    warnings: options.input.previewOffer.warnings,
    ...(options.input.selection.allegroOfferId
      ? { allegroOfferId: options.input.selection.allegroOfferId }
      : {}),
    ...(options.input.formattedPrice
      ? { formattedPrice: options.input.formattedPrice }
      : {}),
    ...(typeof options.input.priceAmountMinor === "number"
      ? { priceAmountMinor: options.input.priceAmountMinor }
      : {}),
    ...(options.input.priceError
      ? { priceError: options.input.priceError }
      : {}),
    ...(options.input.product.updatedAt
      ? { productUpdatedAt: options.input.product.updatedAt }
      : {}),
  };
}

export async function loadStoredAllegroExportOffers(options: {
  categoryId: string;
  channelId: string;
  productId: string;
}): Promise<AllegroExportStoredOffer[]> {
  const collectionRef = db.collection<Record<string, unknown>>(
    firestore,
    getAllegroExportOffersCollectionPath(options.channelId),
  );
  const snapshot = await getDocs(collectionRef);

  return snapshot.docs
    .flatMap((docSnapshot) => {
      const data = docSnapshot.data();
      if (
        !isAllegroExportStoredOffer(data) ||
        data.productId !== options.productId ||
        data.categoryId !== options.categoryId
      ) {
        return [];
      }

      return [data];
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

export async function saveStoredAllegroExportOffer(options: {
  channelId: string;
  input: AllegroExportStoredOfferInput;
}): Promise<AllegroExportStoredOffer> {
  const offerId = buildAllegroExportStoredOfferId({
    categoryId: options.input.categoryId,
    productId: options.input.product.id,
    selectionId: options.input.selection.id,
  });
  const offerRef = getAllegroExportOfferRef(options.channelId, offerId);
  const existingSnapshot = await getDoc(offerRef);
  const now = Timestamp.now();
  const storedOffer = createAllegroExportStoredOfferData({
    channelId: options.channelId,
    input: options.input,
    now,
    previousCreatedAt: existingSnapshot.data()?.createdAt,
  });

  await setDoc(offerRef, storedOffer, { merge: true });

  return storedOffer;
}

export async function deleteStoredAllegroExportOffer(options: {
  channelId: string;
  offerId: string;
}): Promise<void> {
  await deleteDoc(getAllegroExportOfferRef(options.channelId, options.offerId));
}
