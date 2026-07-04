import { createAllegroDescriptionContent } from "@/lib/allegro-description";
import { type AllegroExportParameterMapping } from "@/lib/allegro-export-preview";
import { type AllegroPublicationSettings } from "@/lib/allegro-import-settings";
import { createHash } from "crypto";

const VOLUME_MAPPING_ATTRIBUTE_ID = "product-volume";
const DEFAULT_ALLEGRO_TAX_SETTINGS = {
  exemption: "MONEY_EQUIVALENT",
  rates: [{ countryCode: "PL", rate: "23.00" }],
  subject: "GOODS",
} satisfies AllegroProductOfferPayload["taxSettings"];

export interface AllegroManualParameterValue {
  describesProduct?: boolean;
  parameterId: string;
  parameterName: string;
  valueId?: string;
  valueLabel: string;
}

export interface AllegroPublishOfferRequest {
  allegroOfferId?: string | null;
  categoryId: string;
  configurationDescription: string;
  currency: string;
  descriptionHtml: string;
  externalId: string;
  handlingTime?: string;
  imageUrls: string[];
  manualParameters?: AllegroManualParameterValue[];
  parameters: AllegroExportParameterMapping[];
  publicationSettings: AllegroPublicationSettings;
  priceAmountMinor: number;
  productName: string;
  quantity: number;
  safetyInformationDescription: string;
  title: string;
}

export interface AllegroProductOfferPayload {
  afterSalesServices?: {
    impliedWarranty?: { id: string };
    returnPolicy?: { id: string };
    warranty?: { id: string };
  };
  category: { id: string };
  delivery?: {
    handlingTime?: string;
    shippingRates?: { id: string };
  };
  description: {
    sections: Array<{
      items: Array<
        { type: "TEXT"; content: string } | { type: "IMAGE"; url: string }
      >;
    }>;
  };
  external: { id: string };
  images?: string[];
  name: string;
  parameters: AllegroProductOfferParameterPayload[];
  payments: { invoice: "VAT" };
  productSet: Array<{
    product: {
      images?: string[];
      parameters: AllegroProductOfferParameterPayload[];
    };
    quantity: { value: number };
    responsibleProducer?: { id: string; type: "ID" };
    safetyInformation?: { description: string; type: "TEXT" };
  }>;
  publication: { status: "ACTIVE" };
  sellingMode: {
    format: "BUY_NOW";
    price: { amount: string; currency: string };
  };
  stock: { available: number; unit: "UNIT" };
  taxSettings: {
    exemption?: string;
    rates: Array<{
      countryCode: string;
      rate: string;
    }>;
    subject: string;
  };
}

export type AllegroProductOfferParameterPayload = {
  id: string;
} & (
  | {
      values: string[];
      valuesIds?: never;
    }
  | {
      values?: never;
      valuesIds: string[];
    }
);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isAllegroPublicationSettings(
  value: unknown,
): value is AllegroPublicationSettings {
  return (
    isObject(value) &&
    typeof value.defaultStock === "number" &&
    typeof value.enabled === "boolean" &&
    typeof value.handlingTime === "string" &&
    typeof value.impliedWarrantyId === "string" &&
    typeof value.responsibleProducerId === "string" &&
    typeof value.returnPolicyId === "string" &&
    typeof value.safetyInformationDescription === "string" &&
    typeof value.shippingRatesId === "string" &&
    typeof value.warrantyId === "string"
  );
}

function isAllegroExportParameterMapping(
  value: unknown,
): value is AllegroExportParameterMapping {
  return (
    isObject(value) &&
    typeof value.attributeId === "string" &&
    typeof value.attributeName === "string" &&
    typeof value.status === "string" &&
    typeof value.valueLabel === "string" &&
    (value.describesProduct === undefined ||
      typeof value.describesProduct === "boolean") &&
    (value.parameterId === undefined ||
      typeof value.parameterId === "string") &&
    (value.valueId === undefined || typeof value.valueId === "string")
  );
}

function isAllegroManualParameterValue(
  value: unknown,
): value is AllegroManualParameterValue {
  return (
    isObject(value) &&
    typeof value.parameterId === "string" &&
    typeof value.parameterName === "string" &&
    typeof value.valueLabel === "string" &&
    (value.describesProduct === undefined ||
      typeof value.describesProduct === "boolean") &&
    (value.valueId === undefined || typeof value.valueId === "string")
  );
}

export function isAllegroPublishOfferRequest(
  value: unknown,
): value is AllegroPublishOfferRequest {
  return (
    isObject(value) &&
    (value.allegroOfferId === undefined ||
      value.allegroOfferId === null ||
      typeof value.allegroOfferId === "string") &&
    typeof value.categoryId === "string" &&
    typeof value.configurationDescription === "string" &&
    typeof value.currency === "string" &&
    typeof value.descriptionHtml === "string" &&
    typeof value.externalId === "string" &&
    (value.handlingTime === undefined ||
      typeof value.handlingTime === "string") &&
    isStringArray(value.imageUrls) &&
    (value.manualParameters === undefined ||
      (Array.isArray(value.manualParameters) &&
        value.manualParameters.every(isAllegroManualParameterValue))) &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isAllegroExportParameterMapping) &&
    isAllegroPublicationSettings(value.publicationSettings) &&
    typeof value.priceAmountMinor === "number" &&
    typeof value.productName === "string" &&
    typeof value.quantity === "number" &&
    typeof value.safetyInformationDescription === "string" &&
    typeof value.title === "string"
  );
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 75);
}

function toAllegroAmount(priceAmountMinor: number): string {
  return (priceAmountMinor / 100).toFixed(2);
}

function getOptionalSettingValue(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}

function getStockAvailable(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 10;
  return Math.floor(value);
}

function buildParameterPayload(options: {
  id: string;
  valueId?: string;
  valueLabel: string;
}): AllegroProductOfferParameterPayload | null {
  const id = options.id.trim();
  const valueId = options.valueId?.trim();
  const valueLabel = options.valueLabel.trim();
  if (!id) return null;

  if (valueId) {
    return {
      id,
      valuesIds: [valueId],
    };
  }

  if (!valueLabel) return null;
  return {
    id,
    values: [valueLabel],
  };
}

export function normalizeAllegroExternalId(value: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue.length <= 100) return trimmedValue;

  const digest = createHash("sha256")
    .update(trimmedValue, "utf8")
    .digest("hex")
    .slice(0, 16);

  return `${trimmedValue.slice(0, 83)}|${digest}`;
}

export function isAllegroPublicationEnabled(
  settings: AllegroPublicationSettings,
): boolean {
  return settings.enabled;
}

function isProductSetParameter(
  mapping: AllegroExportParameterMapping,
): boolean {
  return (
    mapping.attributeId !== VOLUME_MAPPING_ATTRIBUTE_ID &&
    mapping.describesProduct === true
  );
}

function isOfferParameter(mapping: AllegroExportParameterMapping): boolean {
  return mapping.describesProduct !== true;
}

export function buildAllegroProductOfferPayload(
  input: AllegroPublishOfferRequest,
): AllegroProductOfferPayload {
  const mappedParameters = input.parameters.flatMap((parameter) => {
    if (
      !isOfferParameter(parameter) ||
      parameter.status !== "mapped" ||
      !parameter.parameterId
    ) {
      return [];
    }
    const payload = buildParameterPayload({
      id: parameter.parameterId,
      valueId: parameter.valueId,
      valueLabel: parameter.valueLabel,
    });
    return payload ? [payload] : [];
  });
  const mappedParameterIds = new Set(mappedParameters.map((item) => item.id));
  const manualParameters = (input.manualParameters ?? []).flatMap(
    (parameter) => {
      if (
        parameter.describesProduct === true ||
        mappedParameterIds.has(parameter.parameterId)
      ) {
        return [];
      }
      const payload = buildParameterPayload({
        id: parameter.parameterId,
        valueId: parameter.valueId,
        valueLabel: parameter.valueLabel,
      });
      return payload ? [payload] : [];
    },
  );
  const offerParameters = [...mappedParameters, ...manualParameters];
  const productParameters = input.parameters.flatMap((parameter) => {
    if (
      !isProductSetParameter(parameter) ||
      parameter.status !== "mapped" ||
      !parameter.parameterId
    ) {
      return [];
    }
    const payload = buildParameterPayload({
      id: parameter.parameterId,
      valueId: parameter.valueId,
      valueLabel: parameter.valueLabel,
    });
    return payload ? [payload] : [];
  });
  const productParameterIds = new Set(productParameters.map((item) => item.id));
  const manualProductParameters = (input.manualParameters ?? []).flatMap(
    (parameter) => {
      if (
        parameter.describesProduct !== true ||
        productParameterIds.has(parameter.parameterId)
      ) {
        return [];
      }
      const payload = buildParameterPayload({
        id: parameter.parameterId,
        valueId: parameter.valueId,
        valueLabel: parameter.valueLabel,
      });
      return payload ? [payload] : [];
    },
  );
  const productSetParameters = [
    ...productParameters,
    ...manualProductParameters,
  ];
  const shippingRatesId = getOptionalSettingValue(
    input.publicationSettings.shippingRatesId,
  );
  const handlingTime =
    getOptionalSettingValue(input.handlingTime ?? "") ??
    getOptionalSettingValue(input.publicationSettings.handlingTime) ??
    "P3D";
  const returnPolicyId = getOptionalSettingValue(
    input.publicationSettings.returnPolicyId,
  );
  const impliedWarrantyId = getOptionalSettingValue(
    input.publicationSettings.impliedWarrantyId,
  );
  const warrantyId = getOptionalSettingValue(
    input.publicationSettings.warrantyId,
  );
  const stockAvailable = getStockAvailable(
    input.publicationSettings.defaultStock,
  );
  const responsibleProducerId = getOptionalSettingValue(
    input.publicationSettings.responsibleProducerId,
  );
  const safetyInformationDescription = getOptionalSettingValue(
    input.safetyInformationDescription,
  );
  const descriptionHtml =
    input.descriptionHtml.trim() ||
    createAllegroDescriptionContent({
      configurationDescription: input.configurationDescription,
      description: "",
      manualParameters: input.manualParameters,
      parameters: input.parameters,
      productName: input.productName,
      quantity: input.quantity,
    });

  return {
    category: { id: input.categoryId },
    description: {
      sections: [
        {
          items: [{ type: "TEXT", content: descriptionHtml }],
        },
        ...input.imageUrls.slice(0, 8).map((url) => ({
          items: [{ type: "IMAGE" as const, url }],
        })),
      ],
    },
    external: { id: normalizeAllegroExternalId(input.externalId) },
    ...(input.imageUrls.length ? { images: input.imageUrls.slice(0, 16) } : {}),
    name: normalizeTitle(input.title),
    parameters: offerParameters,
    payments: { invoice: "VAT" },
    productSet: [
      {
        product: {
          ...(input.imageUrls.length
            ? { images: input.imageUrls.slice(0, 16) }
            : {}),
          parameters: productSetParameters,
        },
        quantity: { value: 1 },
        ...(responsibleProducerId
          ? { responsibleProducer: { id: responsibleProducerId, type: "ID" } }
          : {}),
        ...(safetyInformationDescription
          ? {
              safetyInformation: {
                description: safetyInformationDescription.slice(0, 5000),
                type: "TEXT",
              },
            }
          : {}),
      },
    ],
    publication: { status: "ACTIVE" },
    sellingMode: {
      format: "BUY_NOW",
      price: {
        amount: toAllegroAmount(input.priceAmountMinor),
        currency: input.currency,
      },
    },
    stock: {
      available: stockAvailable,
      unit: "UNIT",
    },
    taxSettings: DEFAULT_ALLEGRO_TAX_SETTINGS,
    ...(shippingRatesId
      ? {
          delivery: {
            handlingTime,
            shippingRates: { id: shippingRatesId },
          },
        }
      : {}),
    ...(returnPolicyId || impliedWarrantyId || warrantyId
      ? {
          afterSalesServices: {
            ...(impliedWarrantyId
              ? { impliedWarranty: { id: impliedWarrantyId } }
              : {}),
            ...(returnPolicyId ? { returnPolicy: { id: returnPolicyId } } : {}),
            ...(warrantyId ? { warranty: { id: warrantyId } } : {}),
          },
        }
      : {}),
  };
}
