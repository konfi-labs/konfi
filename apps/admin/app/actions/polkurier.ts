"use server";

import {
  getPolkurierAuthorization,
  postPolkurierEnvelope,
  postPolkurierRawEnvelope,
} from "@/lib/polkurier/client";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type {
  AddressInput,
  AvailableCarriersEnvelope,
  CancelOrderEnvelope,
  GetCourierPickupTimeEnvelope,
  GetCourierPointEnvelope,
  GetOrdersEnvelope,
  GetProtocolEnvelope,
  GetStatusEnvelope,
  OrderSummary,
  OrderValuationEnvelope,
} from "@konfi/polkurier";
import { ShippingOptions } from "@konfi/types";
import { parseStreetAddress } from "@konfi/utils";

import { checkAdmin, checkPolkurierEnv, getAdminConfigFlags } from ".";
import {
  COD,
  CreateOrder,
  Pack as PolkurierPack,
  Pickup as PolkurierPickup,
  Recipient as PolkurierRecipient,
  Sender as PolkurierSender,
} from "@konfi/polkurier";

function isPolkurierLockerCourier(courierCode: string): boolean {
  const normalizedCode = courierCode.toUpperCase();

  return (
    normalizedCode.includes("INPOST_PACZKOMAT") ||
    normalizedCode.includes("PACZKOMAT")
  );
}

/**
 * Maps polkurier courier codes to ShippingOptions enum
 */
function mapPolkurierCourierToShippingOption(
  courierCode: string,
): ShippingOptions {
  const normalizedCode = courierCode.toUpperCase();

  if (
    normalizedCode.includes("INPOST_PACZKOMAT") ||
    normalizedCode.includes("PACZKOMAT")
  ) {
    return ShippingOptions.PACZKOMATY_INPOST;
  }
  if (normalizedCode.includes("INPOST")) {
    return ShippingOptions.INPOST;
  }
  if (normalizedCode.includes("DPD")) {
    return ShippingOptions.DPD;
  }
  if (normalizedCode.includes("DHL")) {
    return ShippingOptions.DHL;
  }
  if (normalizedCode.includes("FEDEX")) {
    return ShippingOptions.FEDEX;
  }

  // Default to CUSTOM if no match
  return ShippingOptions.CUSTOM;
}

function getValidatedEnumValue<T extends Record<string, string>>(
  enumObject: T,
  value: string,
  fallback: T[keyof T],
): T[keyof T] {
  const values = Object.values(enumObject);

  return values.includes(value as T[keyof T])
    ? (value as T[keyof T])
    : fallback;
}

function normalizePickupDateValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.split("T")[0] || null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0] || null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const dateValue = value as {
    toString?: () => string;
    year?: number;
    month?: number;
    day?: number;
  };

  if (
    typeof dateValue.year === "number" &&
    typeof dateValue.month === "number" &&
    typeof dateValue.day === "number"
  ) {
    const year = String(dateValue.year).padStart(4, "0");
    const month = String(dateValue.month).padStart(2, "0");
    const day = String(dateValue.day).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof dateValue.toString === "function") {
    const stringValue = dateValue.toString();
    if (stringValue && stringValue !== "[object Object]") {
      return stringValue.split("T")[0] || null;
    }
  }

  return null;
}

function normalizePolkurierTextValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (typeof item === "number" && Number.isFinite(item)) {
          return String(item);
        }

        return normalizePolkurierTextValue(item);
      })
      .filter((item): item is string => item !== null && item !== undefined);

    if (normalizedItems.length > 0) {
      const joinedValue = normalizedItems.join("").trim();
      return joinedValue.length > 0 ? joinedValue : null;
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizePolkurierBankAccount(value?: string): string | undefined {
  const normalized = value?.replace(/\D/g, "");
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function extractPolkurierApiErrorMessage(value: unknown): string | null {
  const directValue = normalizePolkurierTextValue(value);
  if (directValue) {
    return directValue;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "message",
    "error",
    "description",
    "detail",
    "status_message",
    "response",
  ];

  for (const key of candidateKeys) {
    const candidate = normalizePolkurierTextValue(record[key]);
    if (candidate) {
      return candidate;
    }
  }

  if (
    record.additionalData &&
    typeof record.additionalData === "object" &&
    record.additionalData !== null
  ) {
    const additionalData = record.additionalData as Record<string, unknown>;

    for (const candidate of Object.values(additionalData)) {
      const normalizedCandidate = normalizePolkurierTextValue(candidate);
      if (normalizedCandidate) {
        return normalizedCandidate;
      }
    }
  }

  return null;
}

function extractPolkurierOrderNumber(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "orderNumber",
    "order_number",
    "orderno",
    "order_id",
    "id",
    "number",
  ];

  for (const key of candidateKeys) {
    const candidate = normalizePolkurierTextValue(record[key]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractPolkurierPointRecords(
  value: unknown,
): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const numericKeys = Object.keys(record).filter((key) => /^\d+$/.test(key));

  if (numericKeys.length > 0) {
    return numericKeys
      .toSorted((a, b) => Number(a) - Number(b))
      .map((key) => record[key])
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      );
  }

  if (
    "id" in record ||
    "point_id" in record ||
    "name" in record ||
    "city" in record ||
    "zip" in record ||
    "post_code" in record
  ) {
    return [record];
  }

  return [];
}

function normalizePolkurierPointBoolean(value?: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return undefined;
}

function normalizePolkurierPointNumber(value?: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function buildPolkurierAddressEntity<
  T extends PolkurierSender | PolkurierRecipient,
>(
  entity: T,
  address: {
    name: string;
    company?: string;
    street: string;
    zip: string;
    city: string;
    country: string;
    email?: string;
    phone?: string;
    pointId?: string;
  },
): T {
  const parsedStreet = parseStreetAddress(address.street);
  const normalizedStreet = parsedStreet.street?.trim() || address.street.trim();
  const houseNumber = parsedStreet.number?.trim() || "";
  const flatNumber = parsedStreet.flat?.trim() || undefined;

  entity.setPerson(address.name);
  entity.setCompany(address.company ?? "");
  entity.setStreet(normalizedStreet);
  entity.setHouseNumber(houseNumber);
  if (flatNumber) {
    entity.setFlatNumber(flatNumber);
  }
  entity.setPostcode(address.zip);
  entity.setCity(address.city);
  if (address.email) {
    entity.setEmail(address.email);
  }
  if (address.phone) {
    entity.setPhone(address.phone);
  }
  entity.setCountry(address.country);
  if (address.pointId) {
    entity.setPointId(address.pointId);
  }

  return entity;
}

export async function isPolkurierApiKeyProvided() {
  const flags = await getAdminConfigFlags();
  return flags.polkurierApiKeyProvided;
}

export async function getPolkurierOrders(options?: {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    await checkPolkurierEnv();

    const authorization = await getPolkurierAuthorization();

    const response = await postPolkurierEnvelope<{
      totalrows?: number;
      totalpages?: number;
      currentpage?: number;
      pagesize?: number;
      result?: OrderSummary[];
      [key: string]: unknown;
    }>({
      authorization,
      apimethod: "get_orders",
      apimetod: "get_orders",
      data: {
        page: options?.page ?? 1,
        pagesize: options?.limit ?? 50,
        packs: true,
        items: true,
        files: true,
      },
    } as GetOrdersEnvelope);

    const normalizeText = (value: unknown): string => {
      if (typeof value === "string") {
        return value;
      }

      if (typeof value === "number") {
        return value.toString();
      }

      return "";
    };

    const normalizeAddress = (
      address: AddressInput | Record<string, unknown> | null | undefined,
    ) => {
      const addressRecord = (address ?? {}) as Record<string, unknown>;

      return {
        name:
          typeof addressRecord.name === "string"
            ? addressRecord.name
            : typeof address?.person === "string"
              ? address.person
              : "",
        street: typeof address?.street === "string" ? address.street : "",
        house_number: normalizeText(
          address?.housenumber ?? addressRecord.house_number,
        ),
        flat_number: normalizeText(
          address?.flatnumber ?? addressRecord.flat_number,
        ),
        postcode: normalizeText(address?.postcode),
        city: normalizeText(address?.city),
        country: normalizeText(address?.country),
        phone: typeof address?.phone === "string" ? address.phone : undefined,
        email: typeof address?.email === "string" ? address.email : undefined,
      };
    };

    const rawOrders = Array.isArray(response?.result)
      ? response.result
      : response
        ? [response as unknown as OrderSummary]
        : [];

    const orders = rawOrders.map((order) => {
      const orderAdditionalData = order as unknown as Record<string, unknown>;
      const rawCod =
        orderAdditionalData.COD && typeof orderAdditionalData.COD === "object"
          ? (orderAdditionalData.COD as Record<string, unknown>)
          : undefined;

      const orderNumber = normalizeText(orderAdditionalData.number);

      const orderId =
        typeof orderAdditionalData.order_id === "string"
          ? orderAdditionalData.order_id
          : typeof orderAdditionalData.id === "string"
            ? orderAdditionalData.id
            : orderNumber;

      return {
        orderId,
        orderNumber,
        reference:
          typeof orderAdditionalData.reference === "string"
            ? orderAdditionalData.reference
            : "",
        status: normalizeText(orderAdditionalData.status),
        status_date:
          typeof orderAdditionalData.status_date === "string"
            ? orderAdditionalData.status_date
            : "",
        courier: normalizeText(orderAdditionalData.courier),
        shipment_type: normalizeText(orderAdditionalData.shipmenttype),
        tracking_number:
          typeof orderAdditionalData.tracking_number === "string"
            ? orderAdditionalData.tracking_number
            : undefined,
        tracking_url:
          typeof orderAdditionalData.tracking_url === "string"
            ? orderAdditionalData.tracking_url
            : typeof orderAdditionalData.url_tracktrace === "string"
              ? orderAdditionalData.url_tracktrace
              : typeof orderAdditionalData.url === "string"
                ? orderAdditionalData.url
                : undefined,
        sender: normalizeAddress(orderAdditionalData.sender as AddressInput),
        recipient: normalizeAddress(
          orderAdditionalData.recipient as AddressInput,
        ),
        packs: Array.isArray(orderAdditionalData.packs)
          ? (orderAdditionalData.packs as Array<Record<string, unknown>>).map(
              (pack) => ({
                width: Number(pack.width) || 0,
                height: Number(pack.height) || 0,
                length: Number(pack.length) || 0,
                weight: Number(pack.weight) || 0,
                amount: Number(pack.amount) || 1,
                type: typeof pack.type === "string" ? pack.type : "",
              }),
            )
          : [],
        cod: rawCod
          ? {
              amount: Number(rawCod.codamount ?? rawCod.amount) || 0,
              bank_account:
                typeof rawCod.codbankaccount === "string"
                  ? rawCod.codbankaccount
                  : typeof rawCod.bank_account === "string"
                    ? rawCod.bank_account
                    : undefined,
              return_cod:
                typeof rawCod.return_cod === "string"
                  ? rawCod.return_cod
                  : undefined,
              cod_type:
                typeof rawCod.codtype === "string" ? rawCod.codtype : undefined,
            }
          : undefined,
        insurance: Number(orderAdditionalData.insurance) || undefined,
        created_at:
          typeof orderAdditionalData.date === "string"
            ? orderAdditionalData.date
            : typeof orderAdditionalData.created_at === "string"
              ? orderAdditionalData.created_at
              : "",
        pickup_date:
          typeof orderAdditionalData.pickup_date === "string"
            ? orderAdditionalData.pickup_date
            : typeof (
                  orderAdditionalData.pickup as
                    | Record<string, unknown>
                    | undefined
                )?.pickupdate === "string"
              ? ((orderAdditionalData.pickup as Record<string, unknown>)
                  .pickupdate as string)
              : typeof orderAdditionalData.pickup_date === "string"
                ? orderAdditionalData.pickup_date
                : undefined,
        raw: orderAdditionalData,
      };
    });

    return {
      success: true,
      orders,
      totalRows:
        typeof response?.totalrows === "number"
          ? response.totalrows
          : orders.length,
      totalPages:
        typeof response?.totalpages === "number" ? response.totalpages : 1,
      currentPage:
        typeof response?.currentpage === "number"
          ? response.currentpage
          : (options?.page ?? 1),
      pageSize:
        typeof response?.pagesize === "number"
          ? response.pagesize
          : (options?.limit ?? 50),
    };
  } catch (error) {
    console.error("Error fetching Polkurier orders:", error);
    throw error;
  }
}

export async function getCourierPickupTime(data: {
  courier: string;
  shipmentType: string;
  shipFrom?: string;
}) {
  try {
    await checkPolkurierEnv();
    const authorization = await getPolkurierAuthorization();

    const pickupData =
      (await postPolkurierEnvelope<
        Array<{
          pickupdate?: string | Date | null;
          time?: Array<{
            timefrom?: string;
            timeto?: string;
          }>;
        }>
      >({
        authorization,
        apimethod: "get_courier_pickup_time",
        apimetod: "get_courier_pickup_time",
        data: {
          courier: data.courier,
          parcel: data.shipmentType as
            | "box"
            | "pallet"
            | "envelope"
            | "document",
          shipfrom: data.shipFrom,
        },
      } as GetCourierPickupTimeEnvelope)) ?? [];

    // Transform API response into easier-to-use format
    const dates = pickupData
      .map((item) => normalizePickupDateValue(item.pickupdate))
      .filter((item): item is string => typeof item === "string");
    const timeSlots: Record<
      string,
      Array<{ timefrom: string; timeto: string }>
    > = {};

    pickupData.forEach((item) => {
      const pickupDate = normalizePickupDateValue(item.pickupdate);
      if (!pickupDate || !Array.isArray(item.time)) {
        return;
      }

      timeSlots[pickupDate] = item.time.filter(
        (slot): slot is { timefrom: string; timeto: string } =>
          typeof slot.timefrom === "string" && typeof slot.timeto === "string",
      );
    });

    return {
      success: true,
      dates,
      timeSlots,
    };
  } catch (error) {
    console.error("Error fetching courier pickup times:", error);
    throw error;
  }
}

export async function createPolkurierOrder(orderData: {
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
    await checkPolkurierEnv();

    const authorization = await getPolkurierAuthorization();

    const { ShipmentType, PackType } = await import("@konfi/polkurier");

    const isLockerShipment = isPolkurierLockerCourier(orderData.courier);
    const shouldSkipCourierPickup =
      isLockerShipment || orderData.noCourierOrder === true;
    const shipmentType = getValidatedEnumValue(
      ShipmentType,
      orderData.shipmentType,
      ShipmentType.BOX,
    );
    const packType = getValidatedEnumValue(
      PackType,
      orderData.packType,
      PackType.ST,
    );
    const normalizedCodBankAccount = normalizePolkurierBankAccount(
      orderData.codBankAccount,
    );

    const createOrderMethod = new CreateOrder();
    createOrderMethod.setShipmentType(shipmentType);
    createOrderMethod.setCourier(orderData.courier);
    createOrderMethod.setDescription(orderData.description);

    const sender = buildPolkurierAddressEntity(new PolkurierSender(), {
      ...orderData.sender,
      pointId: orderData.senderPointId,
    });
    createOrderMethod.setSender(sender);

    const recipient = buildPolkurierAddressEntity(new PolkurierRecipient(), {
      ...orderData.recipient,
      pointId: orderData.recipientPointId,
    });
    createOrderMethod.setRecipient(recipient);

    const pack = new PolkurierPack();
    pack.setWidth(orderData.packWidth);
    pack.setHeight(orderData.packHeight);
    pack.setLength(orderData.packLength);
    pack.setWeight(orderData.packWeight);
    pack.setAmount(orderData.packAmount);
    pack.setType(packType);
    createOrderMethod.addPack(pack);

    const pickup = new PolkurierPickup();
    pickup.setNoCourierOrder(shouldSkipCourierPickup);
    if (!shouldSkipCourierPickup && orderData.pickupDate) {
      pickup.setDate(orderData.pickupDate);
    }
    if (!shouldSkipCourierPickup && orderData.pickupTimeFrom) {
      pickup.setTimeFrom(orderData.pickupTimeFrom);
    }
    if (!shouldSkipCourierPickup && orderData.pickupTimeTo) {
      pickup.setTimeTo(orderData.pickupTimeTo);
    }
    createOrderMethod.setPickup(pickup);

    if (orderData.codAmount > 0) {
      const cod = new COD();
      cod.setAmount(orderData.codAmount);
      if (normalizedCodBankAccount) {
        cod.setBankAccount(normalizedCodBankAccount);
      }
      createOrderMethod.setCod(cod);
    }

    createOrderMethod.setInsurance(orderData.insurance);

    const response = await postPolkurierRawEnvelope({
      authorization,
      apimethod: "create_order",
      apimetod: "create_order",
      data: createOrderMethod.getRequestData(),
    });

    const rpcResponse =
      response && typeof response === "object"
        ? (response as Record<string, unknown>)
        : undefined;
    const payload = rpcResponse?.response ?? response;
    const orderNumber = extractPolkurierOrderNumber(payload);
    const responseRecord =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : undefined;
    const labels = Array.isArray(responseRecord?.label)
      ? (responseRecord.label as string[]).filter(
          (label): label is string =>
            typeof label === "string" && label.trim().length > 0,
        )
      : [];
    const urlTracktrace =
      normalizePolkurierTextValue(responseRecord?.urlTracktrace) ??
      normalizePolkurierTextValue(responseRecord?.url_tracktrace);

    if (!orderNumber) {
      const apiErrorMessage = extractPolkurierApiErrorMessage(payload);
      console.error("Unexpected Polkurier create_order response:", payload);
      throw new Error(
        apiErrorMessage ?? "Polkurier API did not return order_number",
      );
    }

    // Fetch tracking information after successful order creation
    let trackingUrl: string | undefined;
    let trackingNumber: string | string[] | undefined;
    try {
      if (urlTracktrace) {
        trackingUrl = urlTracktrace;
      }

      if (labels.length === 1) {
        trackingNumber = labels[0];
      } else if (labels.length > 1) {
        trackingNumber = labels;
      }
    } catch (statusError) {
      console.error(
        "Error fetching tracking status after order creation:",
        statusError,
      );
      // Don't fail the entire operation if tracking fetch fails
    }

    return {
      success: true,
      orderNumber,
      trackingUrl,
      trackingNumber,
      labelNumbers: labels,
      isLabelReady: labels.length > 0,
      courier: orderData.courier,
      shippingOption: mapPolkurierCourierToShippingOption(orderData.courier),
    };
  } catch (error) {
    console.error("Error creating Polkurier order:", error);
    throw error;
  }
}

export async function getPolkurierLabel(orderNumbers: string[]) {
  try {
    await checkPolkurierEnv();
    const authorization = await getPolkurierAuthorization();
    const result = await postPolkurierRawEnvelope({
      authorization,
      apimethod: "get_label",
      apimetod: "get_label",
      data: {
        orderno: orderNumbers,
      },
    });

    const rpcResponse =
      result && typeof result === "object"
        ? (result as Record<string, unknown>)
        : undefined;
    const payload = rpcResponse?.response ?? result;
    const payloadRecord =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : undefined;
    const file = normalizePolkurierTextValue(payloadRecord?.file);

    if (!file) {
      const apiErrorMessage = extractPolkurierApiErrorMessage(payload);
      throw new Error(
        apiErrorMessage ?? "Polkurier label is not available yet",
      );
    }

    return {
      success: true,
      file, // Base64 encoded PDF
    };
  } catch (error) {
    console.error("Error fetching Polkurier label:", error);
    throw error;
  }
}

export async function getPolkurierStatus(orderNumber: string) {
  try {
    await checkPolkurierEnv();
    const authorization = await getPolkurierAuthorization();
    const result =
      (await postPolkurierEnvelope<{
        url?: string;
        status_date?: string;
        status?: string;
        status_code?: string;
        delivered_date?: string | null;
      }>({
        authorization,
        apimethod: "get_status",
        apimetod: "get_status",
        data: {
          orderno: orderNumber,
        },
      } as GetStatusEnvelope)) ?? {};

    return {
      success: true,
      url: result.url ?? "",
      statusDate: result.status_date ?? "",
      status: result.status ?? "",
      statusCode: result.status_code ?? "",
      deliveredDate: result.delivered_date ?? null,
    };
  } catch (error) {
    console.error("Error fetching Polkurier status:", error);
    throw error;
  }
}

export async function cancelPolkurierOrder(orderNumber: string) {
  try {
    await checkPolkurierEnv();
    const authorization = await getPolkurierAuthorization();

    await postPolkurierEnvelope<{ cancellation?: boolean }>({
      authorization,
      apimethod: "cancel_order",
      apimetod: "cancel_order",
      data: {
        orderno: orderNumber,
      },
    } as CancelOrderEnvelope);

    return {
      success: true,
      message: "Order cancelled successfully",
    };
  } catch (error) {
    console.error("Error cancelling Polkurier order:", error);
    throw error;
  }
}

export async function getAvailableCarriers(data?: {
  senderPostcode?: string;
  recipientPostcode?: string;
  recipientCountry?: string;
  additionalData?: boolean;
  returnCarrier?: string;
}) {
  try {
    await checkPolkurierEnv();
    const authorization = await getPolkurierAuthorization();

    const carriers =
      (await postPolkurierEnvelope<
        Array<{
          servicecode?: string;
          name?: string;
          foreign_shipments?: boolean;
          additional_data?: unknown;
        }>
      >({
        authorization,
        apimethod: "available_carriers",
        apimetod: "available_carriers",
        data: {
          senderPostcode: data?.senderPostcode,
          recipientPostcode: data?.recipientPostcode,
          recipientCountry: data?.recipientCountry,
          additionalDataProperty: data?.additionalData,
          returncarrier: data?.returnCarrier,
        },
      } as AvailableCarriersEnvelope)) ?? [];

    return {
      success: true,
      carriers: carriers.map((carrier) => ({
        servicecode: carrier.servicecode ?? "",
        name: carrier.name ?? carrier.servicecode ?? "",
        foreign_shipments: carrier.foreign_shipments ?? false,
        additional_data: carrier.additional_data,
      })),
    };
  } catch (error) {
    console.error("Error fetching available carriers:", error);
    throw error;
  }
}

export async function getPolkurierProtocol(orderNumbers: string[]) {
  try {
    await checkPolkurierEnv();
    const authorization = await getPolkurierAuthorization();
    const result = await postPolkurierEnvelope<{ file?: string }>({
      authorization,
      apimethod: "get_protocol",
      apimetod: "get_protocol",
      data: {
        orderno: orderNumbers,
      },
    } as GetProtocolEnvelope);

    if (!result?.file) {
      throw new Error("Polkurier API did not return file");
    }

    return {
      success: true,
      file: result.file, // Base64 encoded PDF
    };
  } catch (error) {
    console.error("Error fetching Polkurier protocol:", error);
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
    await checkPolkurierEnv();
    const { ShipmentType, PackType } = await import("@konfi/polkurier");
    const authorization = await getPolkurierAuthorization();
    const shipmentType = data.shipmentType
      ? getValidatedEnumValue(ShipmentType, data.shipmentType, ShipmentType.BOX)
      : undefined;

    const response = await postPolkurierEnvelope<
      Record<string, unknown> | Array<Record<string, unknown>>
    >({
      authorization,
      apimethod: "order_valuation",
      apimetod: "order_valuation",
      data: {
        shipmenttype: shipmentType,
        postcodeSender: data.senderPostcode,
        postcodeRecipient: data.recipientPostcode,
        recipientCountry: data.recipientCountry,
        packs: data.packs.map((pack) => ({
          width: pack.width,
          height: pack.height,
          length: pack.length,
          weight: pack.weight,
          amount: pack.amount,
          type:
            typeof pack.type === "string"
              ? getValidatedEnumValue(PackType, pack.type, PackType.ST)
              : undefined,
        })),
        cOD: data.cod,
        codtype: typeof data.cod === "number" && data.cod > 0 ? "S" : undefined,
        returnCod:
          typeof data.cod === "number" && data.cod > 0 ? "BA" : undefined,
        insurance: data.insurance,
      },
    } as OrderValuationEnvelope);

    const rawValuations = Array.isArray(response)
      ? response
      : response
        ? [response]
        : [];

    const valuations = rawValuations.map((valuation) => ({
      servicecode:
        typeof valuation.servicecode === "string" ? valuation.servicecode : "",
      servicename:
        typeof valuation.serviceName === "string"
          ? valuation.serviceName
          : typeof valuation.servicename === "string"
            ? valuation.servicename
            : typeof valuation.servicecode === "string"
              ? valuation.servicecode
              : "",
      netprice: Number(valuation.netprice) || 0,
      grossprice: Number(valuation.grossprice) || 0,
      promotion_nett: Number(valuation.promotion_nett) || undefined,
      promotion_gross: Number(valuation.promotion_gross) || undefined,
      rebate_nett: Number(valuation.rebate_nett) || undefined,
      rebate_gross: Number(valuation.rebate_gross) || undefined,
      shipment: true,
      available:
        typeof valuation.available === "boolean" ? valuation.available : true,
      unavailable_message:
        typeof valuation.unavailable_message === "string"
          ? valuation.unavailable_message
          : undefined,
    }));

    return {
      success: true,
      valuations,
    };
  } catch (error) {
    console.error("Error fetching order valuation:", error);
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
    await checkPolkurierEnv();

    const authorization = await getPolkurierAuthorization();
    const normalizedSearchQuery = data.searchQuery?.trim() || undefined;
    const normalizedPointId = data.pointId?.trim() || undefined;
    const requestedFunctions =
      data.functions
        ?.map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0) ?? [];

    const lookupCourierPoints = async (functions?: string[]) => {
      const response = await postPolkurierRawEnvelope({
        authorization,
        apimethod: "get_courier_point",
        apimetod: "get_courier_point",
        data: {
          couriers: [data.courier],
          functions,
          searchquery: normalizedSearchQuery,
          id: normalizedPointId,
          limit: data.limit,
          page: data.page,
        },
      } satisfies GetCourierPointEnvelope);

      const rpcResponse =
        response && typeof response === "object"
          ? (response as Record<string, unknown>)
          : undefined;

      return extractPolkurierPointRecords(rpcResponse?.response ?? response);
    };

    const lookupInpostParcelMachines = async (city: string) => {
      const response = await postPolkurierRawEnvelope({
        authorization,
        apimethod: "inpost_parcel_machines",
        apimetod: "inpost_parcel_machines",
        data: {
          city,
        },
      });

      const rpcResponse =
        response && typeof response === "object"
          ? (response as Record<string, unknown>)
          : undefined;

      return extractPolkurierPointRecords(rpcResponse?.response ?? response);
    };

    let rawPoints = await lookupCourierPoints(data.functions);

    if (rawPoints.length === 0 && requestedFunctions.length > 0) {
      rawPoints = await lookupCourierPoints(undefined);
    }

    if (
      rawPoints.length === 0 &&
      isPolkurierLockerCourier(data.courier) &&
      normalizedSearchQuery &&
      !normalizedPointId
    ) {
      rawPoints = await lookupInpostParcelMachines(normalizedSearchQuery);
    }

    const points = rawPoints.map((point) => {
      const id =
        normalizePolkurierTextValue(point.id) ??
        normalizePolkurierTextValue(point.point_id) ??
        normalizePolkurierTextValue(point.name) ??
        "";
      const city = normalizePolkurierTextValue(point.city) ?? "";
      const zip =
        normalizePolkurierTextValue(point.zip) ??
        normalizePolkurierTextValue(point.post_code) ??
        "";
      const street =
        normalizePolkurierTextValue(point.street) ??
        normalizePolkurierTextValue(point.location) ??
        "";
      const location = [zip, city].filter((item) => item.length > 0).join(" ");
      const fallbackAddress = [location, street]
        .filter((item) => item.length > 0)
        .join(", ");
      const formattedAddress =
        normalizePolkurierTextValue(point.address) ??
        normalizePolkurierTextValue(point.location) ??
        fallbackAddress;
      const functions = Array.isArray(point.functions)
        ? point.functions
            .map((item) =>
              typeof item === "string" ? item.trim() : String(item),
            )
            .filter((item) => item.length > 0)
        : undefined;

      return {
        id,
        name: normalizePolkurierTextValue(point.name) ?? id,
        provider: normalizePolkurierTextValue(point.provider) ?? data.courier,
        city,
        zip,
        street,
        description:
          normalizePolkurierTextValue(point.description) ?? undefined,
        latitude: normalizePolkurierPointNumber(point.latitude),
        longitude: normalizePolkurierPointNumber(point.longitude),
        cod: normalizePolkurierPointBoolean(point.cod),
        available: normalizePolkurierPointBoolean(point.available),
        status: normalizePolkurierTextValue(point.status) ?? undefined,
        send: normalizePolkurierPointBoolean(point.send) ?? undefined,
        collect: normalizePolkurierPointBoolean(point.collect) ?? undefined,
        openingHours:
          normalizePolkurierTextValue(point.openingHours) ?? undefined,
        address: formattedAddress,
        visible: normalizePolkurierPointBoolean(point.visible),
        requireApp: normalizePolkurierPointBoolean(point.requireApp),
        requireAppMessage:
          normalizePolkurierTextValue(point.requireAppMessage) ?? undefined,
        functions,
        countryIso: normalizePolkurierTextValue(point.countryiso) ?? undefined,
      };
    });

    const filteredPoints =
      requestedFunctions.length === 0
        ? points
        : points.filter((point) =>
            requestedFunctions.every((requestedFunction) => {
              const normalizedFunctions = point.functions?.map((item) =>
                item.toLowerCase(),
              );

              switch (requestedFunction) {
                case "send":
                  return (
                    point.send ?? normalizedFunctions?.includes("send") ?? true
                  );
                case "collect":
                  return (
                    point.collect ??
                    normalizedFunctions?.includes("collect") ??
                    true
                  );
                case "cod":
                  return (
                    point.cod ?? normalizedFunctions?.includes("cod") ?? true
                  );
                default:
                  return (
                    normalizedFunctions?.includes(requestedFunction) ?? true
                  );
              }
            }),
          );

    return {
      success: true,
      points: filteredPoints,
    };
  } catch (error) {
    console.error("Error fetching courier points:", error);
    throw error;
  }
}

/**
 * Updates order tracking information in Firestore
 */
export async function updateOrderTracking(data: {
  orderId: string;
  channelId: string;
  tracking: {
    number: string | string[];
    shippingOption: ShippingOptions;
    link: string;
  };
}) {
  try {
    // Only require authenticated admin; Polkurier env is not needed for Firestore write
    await checkAdmin();

    // Use Firebase Admin SDK for server-side updates
    const adminDb = getAdminDb();

    // Update the order document with tracking information
    const orderRef = adminDb
      .collection("channels")
      .doc(data.channelId)
      .collection("orders")
      .doc(data.orderId);

    // Merge to avoid failing if other fields exist; create tracking if missing
    await orderRef.set(
      {
        tracking: {
          number: data.tracking.number,
          shippingOption: data.tracking.shippingOption,
          link: data.tracking.link,
        },
      },
      { merge: true },
    );

    return {
      success: true,
      message: "Order tracking updated successfully",
    };
  } catch (error) {
    console.error("Error updating order tracking:", error);
    throw error;
  }
}
