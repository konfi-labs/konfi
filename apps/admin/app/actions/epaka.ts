"use server";

import { ShippingOptions } from "@konfi/types";
import { parseStreetAddress } from "@konfi/utils";
import { cacheLife, cacheTag } from "next/cache";
import { checkAdmin } from ".";
import {
  getEpakaAccessTokenFromCookies,
  getEpakaRefreshTokenFromCookies,
  refreshEpakaToken,
} from "./epaka-oauth";

type AvailableCarrier = {
  servicecode: string;
  name: string;
  courierDeliveryType?: string | null;
  shipmentFromDoor?: boolean | null;
  shipmentFromPoint?: boolean | null;
};

type TimeSlot = { timefrom: string; timeto: string; };

type CourierPoint = {
  id: string;
  name: string;
  provider?: string;
  city?: string;
  zip?: string;
  street?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  cod?: boolean;
  available?: boolean;
  status?: string;
  send?: boolean;
  collect?: boolean;
  openingHours?: string;
  address?: string;
  visible?: boolean;
  requireApp?: boolean;
  requireAppMessage?: string;
  functions?: string[];
  countryIso?: string;
};

const EPAKA_BASE_URL = process.env.EPAKA_API_URL ?? "https://api.epaka.pl";
const EPAKA_AVAILABLE_CARRIERS_TAG = "epaka-available-carriers";

type EpakaCouriersResponse = {
  couriers?: Array<{
    id?: number;
    name?: string;
    courierDeliveryType?: string | null;
    shipmentFromDoor?: boolean | null;
    shipmentFromPoint?: boolean | null;
  }>;
};

async function resolveEpakaToken() {
  await checkAdmin();

  const { token, expiresAt } = await getEpakaAccessTokenFromCookies();
  const now = Date.now();

  if (token && expiresAt && expiresAt > now + 30_000) {
    return token;
  }

  const refreshToken = await getEpakaRefreshTokenFromCookies();
  if (refreshToken) {
    try {
      await refreshEpakaToken();
      const refreshed = await getEpakaAccessTokenFromCookies();
      if (refreshed.token) return refreshed.token;
    } catch (error) {
      console.error("Epaka token refresh failed:", error);
    }
  }

  const envToken =
    process.env.EPAKA_BEARER_TOKEN ??
    process.env.EPAKA_TOKEN ??
    process.env.EPAKA_ACCESS_TOKEN;

  if (!envToken) {
    throw new Error("Epaka credentials not configured on server");
  }

  return envToken;
}

async function epakaRequest<T>(
  path: string,
  init?: RequestInit,
  tokenOverride?: string,
) {
  const token = tokenOverride ?? (await resolveEpakaToken());

  const response = await fetch(`${EPAKA_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const rawBody = await response.text();
  const parseJson = () => {
    try {
      return JSON.parse(rawBody) as T;
    } catch {
      return rawBody as unknown as T;
    }
  };

  if (!response.ok) {
    console.error("Epaka API request failed", {
      status: response.status,
      body: rawBody || response.statusText,
    });
    throw new Error(`Epaka API request failed (${response.status})`);
  }

  if (!rawBody) {
    return undefined as T;
  }

  return parseJson();
}

function mapShipmentType(shipmentType: string) {
  const normalized = shipmentType.toLowerCase();

  if (normalized.includes("pallet") || normalized.includes("palet")) {
    return "pallet";
  }
  if (normalized.includes("envelope") || normalized.includes("letter") || normalized.includes("kop")) {
    return "envelope";
  }

  // Default to package
  return "package";
}

function mapPackType(packType?: string) {
  if (!packType) return 0;
  const normalized = packType.toLowerCase();

  if (normalized.includes("ns") || normalized.includes("dl") || normalized.includes("non")) {
    return 1;
  }

  const numeric = Number.parseInt(packType, 10);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return 0;
}

function duplicatePackages(pack: {
  width: number;
  height: number;
  length: number;
  weight: number;
  amount?: number;
  type?: string;
}) {
  const count = Math.max(1, Number.parseInt(String(pack.amount ?? 1), 10) || 1);
  return Array.from({ length: count }).map(() => ({
    width: pack.width,
    height: pack.height,
    length: pack.length,
    weight: pack.weight,
    type: mapPackType(pack.type),
  }));
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  return {
    firstName: parts.shift() ?? "",
    lastName: parts.join(" ") || parts[0] || "",
  };
}

function mapEpakaCourierToShippingOption(name?: string | null): ShippingOptions {
  const normalized = (name ?? "").toUpperCase();

  if (normalized.includes("INPOST")) return ShippingOptions.INPOST;
  if (normalized.includes("DPD")) return ShippingOptions.DPD;
  if (normalized.includes("DHL")) return ShippingOptions.DHL;
  if (normalized.includes("FEDEX")) return ShippingOptions.FEDEX;

  return ShippingOptions.CUSTOM;
}

function mapAvailableCarriers(response: EpakaCouriersResponse): AvailableCarrier[] {
  return (response?.couriers ?? []).map((courier) => ({
    servicecode: courier.id !== undefined ? String(courier.id) : courier.name ?? "",
    name: courier.name ?? "",
    courierDeliveryType: courier.courierDeliveryType,
    shipmentFromDoor: courier.shipmentFromDoor,
    shipmentFromPoint: courier.shipmentFromPoint,
  }));
}

async function getAvailableCarriersCachedWithServerToken() {
  "use cache";
  cacheLife("hours");
  cacheTag(EPAKA_AVAILABLE_CARRIERS_TAG);

  const envToken =
    process.env.EPAKA_BEARER_TOKEN ??
    process.env.EPAKA_TOKEN ??
    process.env.EPAKA_ACCESS_TOKEN;

  if (!envToken) {
    throw new Error("Epaka server token is not configured");
  }

  const response = await epakaRequest<EpakaCouriersResponse>(
    "/v1/couriers",
    undefined,
    envToken,
  );

  return mapAvailableCarriers(response);
}

export async function getAvailableCarriers() {
  try {
    await checkAdmin();

    const hasServerToken = Boolean(
      process.env.EPAKA_BEARER_TOKEN ??
      process.env.EPAKA_TOKEN ??
      process.env.EPAKA_ACCESS_TOKEN,
    );

    const carriers = hasServerToken
      ? await getAvailableCarriersCachedWithServerToken()
      : mapAvailableCarriers(
        await epakaRequest<EpakaCouriersResponse>("/v1/couriers"),
      );

    return { success: true, carriers };
  } catch (error) {
    console.error("Error fetching Epaka couriers:", error);
    throw error;
  }
}

export async function getCourierPickupTime(data: {
  courier: string;
  shipmentType: string;
  shipFrom?: string;
}) {
  try {
    const courierId = Number.parseInt(data.courier, 10);
    if (!Number.isFinite(courierId)) {
      throw new Error("Invalid courier id for pickup time");
    }

    const pickupDates = await epakaRequest<{
      couriers?: Array<{
        availableDates?: string[];
      }>;
    }>(
      `/v1/order/pickup-date?couriers=${encodeURIComponent(String(courierId))}${data.shipFrom ? `&postCode=${encodeURIComponent(data.shipFrom)}` : ""
      }`
    );

    const dates = pickupDates?.couriers?.[0]?.availableDates ?? [];

    let timeSlots: Record<string, TimeSlot[]> = {};
    if (dates.length > 0) {
      const firstDate = dates[0];
      const pickupHours = await epakaRequest<{
        timeSlots?: Array<{ timeFrom?: string; timeTo?: string; }>;
      }>(
        `/v1/order/pickup-hours?courierId=${courierId}${data.shipFrom ? `&postCode=${encodeURIComponent(data.shipFrom)}` : ""
        }&senderCountry=PL&date=${encodeURIComponent(firstDate)}`
      );

      const slots =
        pickupHours?.timeSlots?.map((slot) => ({
          timefrom: slot.timeFrom ?? "",
          timeto: slot.timeTo ?? "",
        })) ?? [];

      timeSlots = dates.reduce<Record<string, TimeSlot[]>>((acc, date) => {
        acc[date] = slots;
        return acc;
      }, {});
    }

    return {
      success: true,
      dates,
      timeSlots,
    };
  } catch (error) {
    console.error("Error fetching Epaka pickup times:", error);
    throw error;
  }
}

export async function getCourierPoints(data: {
  courier: string;
  searchQuery?: string;
  pointId?: string;
  functions?: string[];
  limit?: number;
  page?: number;
}) {
  try {
    const courierId = Number.parseInt(data.courier, 10);

    const params = new URLSearchParams();
    params.set("limit", String(data.limit ?? 100));
    if (data.searchQuery) params.set("query", data.searchQuery);
    if (data.pointId) params.set("pointId", data.pointId);
    if (Number.isFinite(courierId)) params.append("couriers", String(courierId));
    if (data.functions?.length) params.set("pointFunction", data.functions[0] ?? "all");

    const response = await epakaRequest<{ points?: Array<Record<string, unknown>>; }>(
      `/v1/points?${params.toString()}`
    );

    const points: CourierPoint[] = (response?.points ?? []).map((point) => {
      const id = typeof point.id === "string" ? point.id : "";
      const pointCity = typeof point.city === "string" ? point.city : "";
      const postCode = typeof point.postCode === "string" ? point.postCode : "";
      const street = typeof point.street === "string" ? point.street : "";
      const number = typeof point.number === "string" ? point.number : "";
      const localNumber = typeof point.localNumber === "string" ? point.localNumber : "";
      const addressParts = [street, number, localNumber].filter(Boolean).join(" ");
      const location = [postCode, pointCity].filter(Boolean).join(" ");

      return {
        id,
        name: typeof point.name === "string" ? point.name : id,
        provider:
          typeof point.courier === "object" && point.courier !== null && "name" in point.courier
            ? String((point.courier as Record<string, unknown>).name ?? "")
            : data.courier,
        city: pointCity,
        zip: postCode,
        street: addressParts,
        description: typeof point.other === "string" ? point.other : undefined,
        latitude: typeof point.latitude === "number" ? point.latitude : undefined,
        longitude: typeof point.longitude === "number" ? point.longitude : undefined,
        openingHours: Array.isArray(point.openingHours)
          ? (point.openingHours as string[]).join(", ")
          : undefined,
        address: [location, addressParts].filter(Boolean).join(", "),
        functions: Array.isArray(point.functions) ? (point.functions as string[]) : undefined,
      };
    });

    return { success: true, points };
  } catch (error) {
    console.error("Error fetching Epaka points:", error);
    throw error;
  }
}

export async function getOrderValuation(data: {
  courier?: string;
  shipmentType?: string;
  senderPostcode?: string;
  recipientPostcode?: string;
  recipientCountry?: string;
  packs: Array<{
    width: number;
    height: number;
    length: number;
    weight: number;
    amount?: number;
    type?: string;
  }>;
  insurance?: number;
  cod?: number;
}) {
  try {
    const shippingType = mapShipmentType(data.shipmentType ?? "");
    const packages = data.packs.flatMap((pack) => duplicatePackages(pack));

    const payload = {
      shippingType,
      senderCountry: "PL",
      receiverCountry: (data.recipientCountry ?? "PL").toUpperCase(),
      senderPostCode: data.senderPostcode,
      receiverPostCode: data.recipientPostcode,
      packages,
      courierId: data.courier ? Number.parseInt(data.courier, 10) : undefined,
    };

    const response = await epakaRequest<{
      couriers?: Array<{
        available?: boolean;
        courier?: { id?: number; name?: string; };
        grossPriceTotal?: number;
        netPriceTotal?: number;
        errorMessage?: string;
      }>;
    }>("/v1/order/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const valuations =
      response?.couriers?.map((courierPrice) => ({
        servicecode: courierPrice.courier?.id !== undefined ? String(courierPrice.courier.id) : "",
        servicename: courierPrice.courier?.name ?? "Courier",
        netprice: courierPrice.netPriceTotal ?? 0,
        grossprice: courierPrice.grossPriceTotal ?? courierPrice.netPriceTotal ?? 0,
        promotion_nett: undefined,
        promotion_gross: undefined,
        rebate_nett: undefined,
        rebate_gross: undefined,
        shipment: true,
        available: courierPrice.available ?? true,
        unavailable_message: courierPrice.errorMessage,
      })) ?? [];

    return { success: true, valuations };
  } catch (error) {
    console.error("Error fetching Epaka valuation:", error);
    throw error;
  }
}

export async function createEpakaOrder(orderData: {
  courier: string;
  shipmentType: string;
  description: string;
  packWidth: number;
  packHeight: number;
  packLength: number;
  packWeight: number;
  packAmount: number;
  packType: string;
  pickupDate?: string;
  pickupTimeFrom?: string;
  pickupTimeTo?: string;
  noCourierOrder?: boolean;
  multiPickup?: boolean;
  codAmount: number;
  codBankAccount?: string;
  insurance: number;
  senderPointId?: string;
  recipientPointId?: string;
  sender: {
    name: string;
    company?: string;
    street: string;
    zip: string;
    city: string;
    country: string;
    email: string;
    phone: string;
  };
  recipient: {
    name: string;
    company?: string;
    street: string;
    zip: string;
    city: string;
    country: string;
    email?: string;
    phone?: string;
  };
}) {
  try {
    const courierId = Number.parseInt(orderData.courier, 10);
    if (!Number.isFinite(courierId)) {
      throw new Error("Invalid courier id");
    }

    const shippingType = mapShipmentType(orderData.shipmentType);
    const packages = duplicatePackages({
      width: orderData.packWidth,
      height: orderData.packHeight,
      length: orderData.packLength,
      weight: orderData.packWeight,
      amount: orderData.packAmount,
      type: orderData.packType,
    });

    const senderName = splitName(orderData.sender.name);
    const senderAddress = parseStreetAddress(orderData.sender.street);
    const recipientName = splitName(orderData.recipient.name);
    const recipientAddress = parseStreetAddress(orderData.recipient.street);

    const payload = {
      courierId,
      shippingType,
      content: orderData.description,
      packages,
      pickupDate: orderData.pickupDate,
      pickupTime:
        orderData.pickupTimeFrom && orderData.pickupTimeTo
          ? { from: orderData.pickupTimeFrom, to: orderData.pickupTimeTo }
          : undefined,
      sender: {
        name: senderName.firstName,
        lastName: senderName.lastName,
        company: orderData.sender.company,
        country: orderData.sender.country?.toUpperCase(),
        city: orderData.sender.city,
        street: senderAddress.street,
        houseNumber: senderAddress.number ?? "1",
        flatNumber: senderAddress.flat,
        postCode: orderData.sender.zip,
        phone: orderData.sender.phone,
        email: orderData.sender.email,
        pointId: orderData.senderPointId,
      },
      receiver: {
        name: recipientName.firstName,
        lastName: recipientName.lastName,
        company: orderData.recipient.company,
        country: orderData.recipient.country?.toUpperCase(),
        city: orderData.recipient.city,
        street: recipientAddress.street,
        houseNumber: recipientAddress.number ?? "1",
        flatNumber: recipientAddress.flat,
        postCode: orderData.recipient.zip,
        phone: orderData.recipient.phone ?? "",
        email: orderData.recipient.email,
        pointId: orderData.recipientPointId,
      },
      services: {
        cod: orderData.codAmount > 0,
        codAmount: orderData.codAmount > 0 ? orderData.codAmount : undefined,
        codReturnType: "account",
        bankAccount: orderData.codBankAccount,
        insurance: orderData.insurance > 0,
        declaredValue: orderData.insurance || undefined,
      },
      paymentData: {
        paymentType: orderData.codAmount > 0 ? "pay_on_delivery" : "balance",
      },
    };

    const response = await epakaRequest<{
      orderId?: number;
      paymentData?: { paymentUrl?: string; };
    }>("/v1/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const orderNumber = response?.orderId ? String(response.orderId) : undefined;

    if (!orderNumber) {
      throw new Error("Epaka API did not return order id");
    }

    return {
      success: true,
      orderNumber,
      trackingUrl: response?.paymentData?.paymentUrl,
      trackingNumber: undefined,
      courier: orderData.courier,
      shippingOption: mapEpakaCourierToShippingOption(orderData.courier),
    };
  } catch (error) {
    console.error("Error creating Epaka order:", error);
    throw error;
  }
}

export async function getEpakaLabel(orderNumbers: string[]) {
  try {
    const firstOrderId = Number.parseInt(orderNumbers[0] ?? "", 10);
    if (!Number.isFinite(firstOrderId)) {
      throw new Error("Invalid order id for label download");
    }

    const document = await epakaRequest<{ document?: string; }>(
      `/v1/user/orders/${firstOrderId}/label`
    );

    return {
      success: true,
      file: document?.document ?? "",
    };
  } catch (error) {
    console.error("Error fetching Epaka label:", error);
    throw error;
  }
}

export async function isEpakaConfigured() {
  await checkAdmin();

  const envToken =
    process.env.EPAKA_BEARER_TOKEN ??
    process.env.EPAKA_TOKEN ??
    process.env.EPAKA_ACCESS_TOKEN;

  if (envToken) {
    return true;
  }

  let hasValidAccessToken = false;
  try {
    const { token, expiresAt } = await getEpakaAccessTokenFromCookies();
    hasValidAccessToken = Boolean(
      token && expiresAt && expiresAt > Date.now() + 30_000,
    );
  } catch (error) {
    console.error("Epaka access token check failed:", error);
  }

  if (hasValidAccessToken) {
    return true;
  }

  try {
    const refreshToken = await getEpakaRefreshTokenFromCookies();
    if (refreshToken) {
      return true;
    }
  } catch (error) {
    console.error("Epaka refresh token check failed:", error);
  }

  const hasOAuthEnv = Boolean(
    process.env.EPAKA_CLIENT_ID &&
    process.env.EPAKA_CLIENT_SECRET &&
    process.env.EPAKA_REDIRECT_URI,
  );

  return hasOAuthEnv;
}