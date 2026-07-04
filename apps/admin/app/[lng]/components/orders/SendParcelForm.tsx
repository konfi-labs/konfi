"use client";

import {
  createEpakaOrder,
  getAvailableCarriers as getEpakaAvailableCarriers,
  getCourierPickupTime as getEpakaCourierPickupTime,
  getCourierPoints as getEpakaCourierPoints,
  getEpakaLabel,
  getOrderValuation as getEpakaOrderValuation,
  isEpakaConfigured,
} from "@/actions/epaka";
import {
  createPolkurierOrder,
  getAvailableCarriers as getPolkurierAvailableCarriers,
  getCourierPickupTime as getPolkurierCourierPickupTime,
  getCourierPoints as getPolkurierCourierPoints,
  getPolkurierLabel,
  getOrderValuation as getPolkurierOrderValuation,
  updateOrderTracking,
} from "@/actions/polkurier";
import { useChannels } from "@/context/channels";
import { useConfigurationWarehouses } from "@/context/configuration";
import { useT } from "@/i18n/client";
import {
  findPolkurierCourierForShippingOption,
  mapShippingOptionToPolkurierCourier,
} from "@/lib/polkurier/courier-mapping";
import {
  Alert,
  Badge,
  Button,
  Card,
  Combobox,
  Container,
  createListCollection,
  Fieldset,
  For,
  HStack,
  IconButton,
  Input,
  Select,
  Separator,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { Field, MaterialSymbol, toaster } from "@konfi/components";
import { PackType, ShipmentType } from "@konfi/polkurier";
import {
  isNestedCustomer,
  Order,
  PaymentType,
  ShippingOptions,
  Warehouse,
} from "@konfi/types";
import { parseStreetAddress } from "@konfi/utils";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Controller,
  type Resolver,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import * as yup from "yup";

const createSendParcelSchema = (
  t: (key: string, opts?: { defaultValue: string }) => string,
) =>
  yup.object({
    provider: yup
      .string()
      .required()
      .test("provider", "Invalid provider", (value) =>
        ["epaka", "polkurier"].includes(value),
      )
      .default("polkurier"),
    courier: yup.string().trim().required(),
    shipmentType: yup.string().trim().required(),
    description: yup.string().trim().required().max(30),
    senderPerson: yup.string().trim().required().max(35),
    senderCompany: yup.string().trim().max(35).optional(),
    senderStreet: yup.string().trim().required().max(40),
    senderPostcode: yup.string().trim().required().max(6),
    senderCity: yup.string().trim().required().max(35),
    senderEmail: yup.string().trim().email().required().max(100),
    senderPhone: yup.string().trim().required().max(15),
    senderCountry: yup.string().trim().max(2).default("PL"),
    recipientPerson: yup.string().trim().required().max(35),
    recipientCompany: yup.string().trim().max(35).optional(),
    recipientStreet: yup.string().trim().required().max(40),
    recipientPostcode: yup.string().trim().required().max(6),
    recipientCity: yup.string().trim().required().max(35),
    recipientEmail: yup.string().trim().email().required().max(100),
    recipientPhone: yup.string().trim().required().max(15),
    recipientCountry: yup.string().trim().max(2).default("PL"),
    packs: yup
      .array()
      .of(
        yup.object({
          width: yup.number().min(1).required(),
          height: yup.number().min(1).required(),
          length: yup.number().min(1).required(),
          weight: yup.number().min(0.1).required(),
          amount: yup.number().min(1).max(99).required(),
          type: yup.string().required(),
        }),
      )
      .min(1),
    deliveryMethod: yup
      .string()
      .oneOf(["courier_pickup", "self_delivery"])
      .default("courier_pickup"),
    pickupDate: yup
      .string()
      .when("deliveryMethod", ([deliveryMethod], schema) =>
        deliveryMethod === "courier_pickup"
          ? schema.required()
          : schema.optional(),
      ),
    pickupTimeFrom: yup
      .string()
      .when("deliveryMethod", ([deliveryMethod], schema) =>
        deliveryMethod === "courier_pickup"
          ? schema.required()
          : schema.optional(),
      ),
    pickupTimeTo: yup
      .string()
      .when("deliveryMethod", ([deliveryMethod], schema) =>
        deliveryMethod === "courier_pickup"
          ? schema.required()
          : schema.optional(),
      ),
    pickupPointId: yup.string().trim().optional(),
    pickupPointName: yup.string().trim().optional(),
    recipientPointId: yup.string().trim().optional(),
    recipientPointName: yup.string().trim().optional(),
    codAmount: yup.number().min(0).optional(),
    codBankAccount: yup
      .string()
      .when("codAmount", ([codAmount], schema) =>
        codAmount && codAmount > 0 ? schema.required() : schema.optional(),
      ),
    insurance: yup.number().min(0).required(),
  });

type SendParcelFormData = yup.InferType<
  ReturnType<typeof createSendParcelSchema>
>;

const formatStreetLine = (
  street?: string | null,
  houseNumber?: string | null,
  flatNumber?: string | null,
) => {
  let line = (street ?? "").trim();
  const house = (houseNumber ?? "").trim();
  if (house) {
    const normalizedLine = line.replace(/\s+/g, " ");
    const pattern = new RegExp(`\\b${RegExp.escape(house)}\\b`);
    if (!pattern.test(normalizedLine)) {
      line = line ? `${line} ${house}` : house;
    }
  }

  const flat = (flatNumber ?? "").trim();
  if (flat) {
    const compactLine = line.replace(/\s+/g, "");
    const compactFlat = flat.replace(/\s+/g, "");
    if (!compactLine.includes(compactFlat)) {
      const suffix = flat.startsWith("/") ? flat : `/${flat}`;
      line = line ? `${line}${suffix}` : flat;
    }
  }

  return line.trim();
};

const convertMinorUnitToMajor = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return parseFloat((value / 100).toFixed(2));
};

const normalizeCurrencyValue = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return parseFloat(value.toFixed(2));
};

interface CourierPoint {
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
}

interface CourierPointOption {
  value: string;
  label: string;
  point: CourierPoint;
}

const courierOptions = [
  { value: "DHL", label: "DHL" },
  { value: "INPOST", label: "InPost" },
  { value: "DPD", label: "DPD" },
  { value: "UPS", label: "UPS" },
];

const SELF_DELIVERY_REQUIRED_COURIER_PATTERNS = [
  "INPOST_PACZKOMAT",
  "PACZKOMAT",
];

const POINT_BASED_COURIER_PATTERNS = [
  "ACCESS POINT",
  "ACCESS_POINT",
  "PACZKOMAT",
  "PARCELSHOP",
  "PICKUP",
  "POINT",
  "POP",
  "PUNKT",
  "ORLEN",
  "POCZTA",
];

const hasCourierPattern = (courierCode: string, patterns: string[]) => {
  const normalizedCode = courierCode.toUpperCase();

  return patterns.some((pattern) => normalizedCode.includes(pattern));
};

// Determine if courier requires self delivery (e.g., parcel lockers)
const isSelfDeliveryCourier = (courierCode: string): boolean => {
  return hasCourierPattern(
    courierCode,
    SELF_DELIVERY_REQUIRED_COURIER_PATTERNS,
  );
};

// Determine if courier supports point-based delivery (sender or recipient points)
const isPointBasedCourier = (courierCode: string): boolean => {
  return hasCourierPattern(courierCode, POINT_BASED_COURIER_PATTERNS);
};

const COURIER_ROUTE_PATTERNS = [
  "ADDRESS",
  "COURIER",
  "DOOR",
  "EXPRESS",
  "HOME",
  "KURIER",
  "STANDARD",
];

const inferRouteNode = (value: string): CourierRouteNode | null => {
  const normalized = value.toUpperCase();

  if (hasCourierPattern(normalized, POINT_BASED_COURIER_PATTERNS)) {
    return "point";
  }

  if (hasCourierPattern(normalized, COURIER_ROUTE_PATTERNS)) {
    return "courier";
  }

  return null;
};

const getCourierRouteDetails = (
  serviceName: string | undefined,
  courierCode: string,
): CourierRouteDetails => {
  const normalizedServiceName = (serviceName ?? "")
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const routeSegments = normalizedServiceName
    .split(/-|→|\//)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (routeSegments.length >= 2) {
    const from = inferRouteNode(routeSegments[0]);
    const to = inferRouteNode(routeSegments[routeSegments.length - 1]);

    if (from && to) {
      return { from, to };
    }
  }

  const combinedLabel = `${normalizedServiceName} ${courierCode.toUpperCase()}`;

  if (isSelfDeliveryCourier(combinedLabel)) {
    return { from: "point", to: "point" };
  }

  if (hasCourierPattern(combinedLabel, POINT_BASED_COURIER_PATTERNS)) {
    if (
      normalizedServiceName.startsWith("PACZKOMAT") ||
      normalizedServiceName.startsWith("POINT") ||
      normalizedServiceName.startsWith("POP") ||
      normalizedServiceName.startsWith("PUNKT")
    ) {
      return { from: "point", to: "courier" };
    }

    return { from: "courier", to: "point" };
  }

  return { from: "courier", to: "courier" };
};

// Check if recipient delivery is to a point/locker
const isRecipientPointDelivery = (
  shippingOption?: ShippingOptions | null,
): boolean => {
  return shippingOption === ShippingOptions.PACZKOMATY_INPOST;
};

interface SendParcelFormProps {
  order?: Order;
  warehouse?: Warehouse;
  onSuccess?: (orderId: string) => void;
  onCancel?: () => void;
  showCancelButton?: boolean;
}

type CourierPriceEstimate = {
  servicecode: string;
  servicename: string;
  netprice: number;
  grossprice: number;
  available: boolean;
  unavailable_message?: string;
};

type CourierPriceEstimateMap = Record<string, CourierPriceEstimate>;

type CourierRouteNode = "courier" | "point";

type CourierRouteDetails = {
  from: CourierRouteNode;
  to: CourierRouteNode;
};

type CourierSelectionOption = {
  value: string;
  label: string;
  estimate?: CourierPriceEstimate;
  available: boolean;
  route: CourierRouteDetails;
  serviceLabel?: string;
};

type CourierSelectionOptionWithEstimate = CourierSelectionOption & {
  estimate: CourierPriceEstimate;
};

type PackPayload = {
  width: number;
  height: number;
  length: number;
  weight: number;
  amount: number;
  type: string;
};

const PICKUP_TIMES_FALLBACK_TOAST_COOLDOWN_MS = 5000;

export function SendParcelForm({
  order,
  warehouse,
  onSuccess,
  onCancel,
  showCancelButton = true,
}: SendParcelFormProps) {
  const { t, i18n } = useT(["order", "translation"]);
  const router = useRouter();

  // Create translated option arrays
  const shipmentTypeOptions = [
    {
      value: ShipmentType.BOX,
      label: t("ShipmentType.BOX", { defaultValue: "Box" }),
    },
    {
      value: ShipmentType.PALLET,
      label: t("ShipmentType.PALLET", { defaultValue: "Pallet" }),
    },
    {
      value: ShipmentType.ENVELOPE,
      label: t("ShipmentType.ENVELOPE", { defaultValue: "Envelope" }),
    },
    {
      value: ShipmentType.DOCUMENT,
      label: t("ShipmentType.DOCUMENT", { defaultValue: "Document" }),
    },
  ];

  const packTypeOptions = [
    {
      value: PackType.ST,
      label: t("PackType.ST", { defaultValue: "Standard (ST)" }),
    },
    {
      value: PackType.NST,
      label: t("PackType.NST", { defaultValue: "Non-standard (NST)" }),
    },
    {
      value: PackType.PPAL,
      label: t("PackType.PPAL", { defaultValue: "Half Pallet (PPAL)" }),
    },
    {
      value: PackType.PAL,
      label: t("PackType.PAL", { defaultValue: "Industrial Pallet (PAL)" }),
    },
    {
      value: PackType.DLU,
      label: t("PackType.DLU", { defaultValue: "Long Item (DLU)" }),
    },
  ];
  const { warehouses } = useConfigurationWarehouses();
  const { getChannelById, channels } = useChannels();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPickupTimes, setIsLoadingPickupTimes] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<
    Record<string, Array<{ timefrom: string; timeto: string }>>
  >({});
  const [availableCouriers, setAvailableCouriers] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [isLoadingCouriers, setIsLoadingCouriers] = useState(false);
  const [providerOptions, setProviderOptions] = useState<
    Array<{ value: string; label: string }>
  >([{ value: "polkurier", label: "Polkurier" }]);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(
    null,
  );
  const [isCreatedOrderLabelReady, setIsCreatedOrderLabelReady] =
    useState(false);
  const [packsPreCalculated, setPacksPreCalculated] = useState(false);
  const [pickupPointOptions, setPickupPointOptions] = useState<
    CourierPointOption[]
  >([]);
  const [pickupPointInputValue, setPickupPointInputValue] = useState("");
  const [isLoadingPickupPoints, setIsLoadingPickupPoints] = useState(false);
  const [selectedPickupPoint, setSelectedPickupPoint] =
    useState<CourierPoint | null>(null);
  const [recipientPointOptions, setRecipientPointOptions] = useState<
    CourierPointOption[]
  >([]);
  const [recipientPointInputValue, setRecipientPointInputValue] = useState("");
  const [isLoadingRecipientPoints, setIsLoadingRecipientPoints] =
    useState(false);
  const [selectedRecipientPoint, setSelectedRecipientPoint] =
    useState<CourierPoint | null>(null);
  const pickupPointSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const recipientPointSearchTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const lastPickupPointRequestId = useRef(0);
  const lastRecipientPointRequestId = useRef(0);
  const lastPickupTimeRequestId = useRef(0);
  const previousSelfDeliveryCourier = useRef<string | null>(null);
  const previousRecipientPointCourier = useRef<string | null>(null);
  const lastPickupFallbackToastAtRef = useRef(0);

  // Get the warehouse from the order's channel
  const getChannelWarehouse = () => {
    if (!order?.channelId) return warehouse;
    const channel = getChannelById(order.channelId);
    if (!channel?.warehouses || channel.warehouses.length === 0)
      return warehouse;
    const warehouseId = channel.warehouses[0];
    return warehouses?.find((wh) => wh.id === warehouseId) || warehouse;
  };

  const channelWarehouse = getChannelWarehouse();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    channelWarehouse?.id || warehouse?.id || "",
  );

  const buildDescription = useCallback(
    (fallbackWarehouseId?: string | null) => {
      if (!order) {
        return "";
      }

      const orderNumberRaw = order.number ?? order.id ?? "";
      const orderNumber = String(orderNumberRaw);
      if (orderNumber === "") {
        return "";
      }

      const resolvedFallbackIds = new Set<string>();

      if (fallbackWarehouseId) {
        resolvedFallbackIds.add(fallbackWarehouseId);
      }
      if (selectedWarehouseId) {
        resolvedFallbackIds.add(selectedWarehouseId);
      }
      if (channelWarehouse?.id) {
        resolvedFallbackIds.add(channelWarehouse.id);
      }
      if (warehouse?.id) {
        resolvedFallbackIds.add(warehouse.id);
      }

      let channelName = order.channelId
        ? getChannelById(order.channelId)?.name?.trim()
        : undefined;

      if (!channelName && channels?.length) {
        for (const warehouseId of resolvedFallbackIds) {
          const fallbackChannel = channels.find((candidateChannel) =>
            candidateChannel.warehouses?.includes(warehouseId),
          );
          const fallbackName = fallbackChannel?.name?.trim();
          if (fallbackName) {
            channelName = fallbackName;
            break;
          }
        }
      }

      return channelName ? `${channelName}#${orderNumber}` : `#${orderNumber}`;
    },
    [
      order?.channelId,
      order?.number,
      order?.id,
      selectedWarehouseId,
      channelWarehouse?.id,
      warehouse?.id,
      getChannelById,
      channels,
    ],
  );

  const buildCourierPointLabel = useCallback((point: CourierPoint) => {
    const namePart = point.name || point.id;
    const addressPart =
      point.address ||
      [point.zip, point.city, point.street]
        .filter((item) => item && item.length > 0)
        .join(", ");
    return [namePart, addressPart]
      .filter((item) => item && item.length > 0)
      .join(" • ");
  }, []);

  // Get warehouse options
  const warehouseOptions =
    warehouses?.map((wh) => ({
      value: wh.id,
      label: wh.name || `${wh.address?.city || "Unknown"}`,
    })) || [];

  // Get selected warehouse data
  const getSelectedWarehouse = () => {
    return (
      warehouses?.find((wh) => wh.id === selectedWarehouseId) ||
      channelWarehouse ||
      warehouse
    );
  };

  // Update sender data when warehouse selection changes
  useEffect(() => {
    const selectedWh = getSelectedWarehouse();
    if (selectedWh) {
      // Parse the street address to auto-split into street, number, and flat
      const senderStreetRaw = selectedWh.address?.street || "";
      const senderParsed = parseStreetAddress(senderStreetRaw);
      const senderLine = formatStreetLine(
        senderParsed.street || senderStreetRaw.trim(),
        senderParsed.number || selectedWh.address?.number?.trim() || null,
        senderParsed.flat || selectedWh.address?.local?.trim() || null,
      );

      methods.setValue(
        "senderPerson",
        selectedWh.contacts?.[0]?.name?.trim() || "",
      );
      methods.setValue("senderStreet", senderLine || senderStreetRaw.trim());
      methods.setValue("senderPostcode", selectedWh.address?.zip?.trim() || "");
      methods.setValue("senderCity", selectedWh.address?.city?.trim() || "");
      methods.setValue(
        "senderEmail",
        selectedWh.contacts?.[0]?.email?.trim() || "",
      );
      methods.setValue(
        "senderPhone",
        selectedWh.contacts?.[0]?.phone?.trim() || "",
      );
    }
  }, [selectedWarehouseId, warehouses]);

  // Get default values
  const getDefaultValues = () => {
    // Sender from channel's warehouse (or fallback to passed warehouse)
    const defaultWarehouse = channelWarehouse || warehouse;
    const customLabelAddress =
      order?.anonymousPackageShipping && order.anonymousPackageLabelAddress
        ? order.anonymousPackageLabelAddress
        : null;

    // Parse sender address if it contains number info
    const senderStreetRaw = defaultWarehouse?.address?.street || "";
    const senderParsed = parseStreetAddress(senderStreetRaw);

    const senderStreetLine = formatStreetLine(
      senderParsed.street || senderStreetRaw.trim(),
      senderParsed.number || defaultWarehouse?.address?.number?.trim() || null,
      senderParsed.flat || defaultWarehouse?.address?.local?.trim() || null,
    );

    const senderData = {
      senderPerson:
        customLabelAddress?.name?.trim() ||
        defaultWarehouse?.contacts?.[0]?.name?.trim() ||
        "",
      senderCompany:
        customLabelAddress?.company?.trim() ||
        process.env.NEXT_PUBLIC_SHORT_COMPANY_NAME ||
        "",
      senderStreet:
        customLabelAddress?.street?.trim() ||
        senderStreetLine ||
        senderStreetRaw.trim(),
      senderPostcode:
        customLabelAddress?.zip?.trim() ||
        defaultWarehouse?.address?.zip?.trim() ||
        "",
      senderCity:
        customLabelAddress?.city?.trim() ||
        defaultWarehouse?.address?.city?.trim() ||
        "",
      senderEmail:
        customLabelAddress?.email?.trim() ||
        defaultWarehouse?.contacts?.[0]?.email?.trim() ||
        "",
      senderPhone:
        customLabelAddress?.phone?.trim() ||
        defaultWarehouse?.contacts?.[0]?.phone?.trim() ||
        "",
      senderCountry: "PL",
    };

    // Recipient from order shipping - parse address if it contains number info
    const recipientStreetRaw = order?.shipping?.street || "";
    const recipientParsed = parseStreetAddress(recipientStreetRaw);

    const recipientStreetLine = formatStreetLine(
      recipientParsed.street || recipientStreetRaw.trim(),
      recipientParsed.number || order?.shipping?.number?.trim() || null,
      recipientParsed.flat || order?.shipping?.local?.trim() || null,
    );

    // Determine recipient person name: prioritize contact name, then customer personName, finally customer name
    const recipientPersonName =
      order?.contact?.name?.trim() ||
      (isNestedCustomer(order?.customer)
        ? order?.customer.personName?.trim()
        : null) ||
      (isNestedCustomer(order?.customer)
        ? order?.customer.name
        : order?.customer) ||
      "";

    // Determine recipient company: use shipping companyName, or customer name if it's a business customer
    const recipientCompanyName =
      order?.shipping?.companyName?.trim() ||
      (isNestedCustomer(order?.customer)
        ? order?.customer.name?.trim()
        : null) ||
      "";

    const recipientData = {
      recipientPerson: recipientPersonName,
      recipientCompany: recipientCompanyName,
      recipientStreet: recipientStreetLine || recipientStreetRaw.trim(),
      recipientPostcode: order?.shipping?.zip?.trim() || "",
      recipientCity: order?.shipping?.city?.trim() || "",
      recipientEmail:
        order?.contact?.email?.trim() || order?.email?.trim() || "",
      recipientPhone: order?.contact?.phone?.trim() || "",
      recipientCountry: "PL",
    };

    // COD only for ON_DELIVERY payment type
    const shouldShowCOD =
      order?.paymentType === PaymentType.ON_DELIVERY &&
      !order?.anonymousPackageShipping;
    const totalPriceMajorUnits = convertMinorUnitToMajor(
      order?.totalPrice ?? 0,
    );

    // Determine default delivery method based on courier type
    const defaultCourier = mapShippingOptionToPolkurierCourier(
      order?.shippingOption,
    );
    const defaultDeliveryMethod: "self_delivery" | "courier_pickup" =
      isSelfDeliveryCourier(defaultCourier)
        ? "self_delivery"
        : "courier_pickup";

    return {
      provider: "polkurier",
      courier: defaultCourier,
      shipmentType: ShipmentType.BOX,
      description: buildDescription(
        channelWarehouse?.id || warehouse?.id || null,
      ),
      ...senderData,
      ...recipientData,
      packs: [
        {
          width: 10,
          height: 10,
          length: 10,
          weight: 1,
          amount: 1,
          type: PackType.ST,
        },
      ],
      deliveryMethod: defaultDeliveryMethod,
      pickupDate: new Date().toISOString().split("T")[0],
      pickupTimeFrom: "10:00",
      pickupTimeTo: "14:00",
      pickupPointId: "",
      pickupPointName: "",
      recipientPointId: "",
      recipientPointName: "",
      codAmount: shouldShowCOD ? totalPriceMajorUnits : 0,
      codBankAccount: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "",
      insurance: totalPriceMajorUnits,
    };
  };

  const methods = useForm<SendParcelFormData>({
    resolver: yupResolver(createSendParcelSchema(t), {
      abortEarly: false,
    }) as Resolver<SendParcelFormData>,
    defaultValues: getDefaultValues(),
    mode: "onSubmit",
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = methods;

  // Log validation errors to help with debugging
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.error("Form validation errors:", errors);

      // Display first error as a toast
      const firstErrorKey = Object.keys(errors)[0];
      const firstError = errors[firstErrorKey as keyof typeof errors];

      if (
        firstError &&
        typeof firstError === "object" &&
        "message" in firstError
      ) {
        toaster.error({
          title: t("order.sendParcelForm.validationError", {
            defaultValue: "Validation Error",
          }),
          description:
            String(firstError.message) ||
            t("order.sendParcelForm.checkForm", {
              defaultValue: "Please check the form for errors",
            }),
        });
      }
    }
  }, [errors, t]);

  useEffect(() => {
    if (!order) {
      return;
    }

    const formattedDescription = buildDescription(selectedWarehouseId);
    if (!formattedDescription) {
      return;
    }

    const currentDescription = methods.getValues("description");
    if (currentDescription === formattedDescription) {
      return;
    }

    methods.setValue("description", formattedDescription, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [buildDescription, methods, selectedWarehouseId]);

  type PackCalculationItem = {
    description: string;
    quantity: number;
    width?: number;
    height?: number;
    volume?: number;
    unit: string;
    product?: {
      name?: string;
      weight?: number;
    };
  };

  type PackCalculationResult = {
    packs: Array<{
      width: number;
      height: number;
      length: number;
      weight: number;
      amount: number;
      type: string;
    }>;
  };

  const orderItemsForAi = useMemo<PackCalculationItem[] | null>(() => {
    if (!order?.items || order.items.length === 0) {
      return null;
    }

    return order.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      width: item.width,
      height: item.height,
      volume: item.volume,
      unit: item.unit || "",
      product:
        typeof item.product !== "string"
          ? {
              name: item.product?.name,
            }
          : undefined,
    }));
  }, [order?.items]);

  const {
    data: aiPackCalculation,
    error: aiPackError,
    isLoading: isCalculatingPacks,
  } = useSWRImmutable<PackCalculationResult>(
    orderItemsForAi
      ? ([
          "sendParcelForm:aiPacks",
          String(order?.id || order?.number || "unknown-order"),
          orderItemsForAi,
        ] as const)
      : null,
    async ([, , items]: readonly [string, string, PackCalculationItem[]]) => {
      const { calculatePacksFromOrderItemsAdmin } =
        await import("@/actions/ai");
      return calculatePacksFromOrderItemsAdmin({ orderItems: items });
    },
  );

  useEffect(() => {
    if (!aiPackCalculation?.packs?.length || packsPreCalculated) {
      return;
    }

    methods.setValue(
      "packs",
      aiPackCalculation.packs.map((pack) => ({
        width: pack.width,
        height: pack.height,
        length: pack.length,
        weight: pack.weight,
        amount: pack.amount,
        type: PackType.ST,
      })),
    );
    setPacksPreCalculated(true);
  }, [aiPackCalculation, methods, packsPreCalculated]);

  useEffect(() => {
    if (!aiPackError) {
      return;
    }

    console.error("Error calculating packs with AI:", aiPackError);
  }, [aiPackError]);

  useEffect(() => {
    if (!order) {
      return;
    }

    setPacksPreCalculated(false);
  }, [order?.id, orderItemsForAi]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "packs",
  });

  const watchedCodAmount = useWatch({ control, name: "codAmount" });
  const codAmount = useMemo(() => {
    if (typeof watchedCodAmount === "number") {
      return Number.isFinite(watchedCodAmount) ? watchedCodAmount : 0;
    }

    if (typeof watchedCodAmount === "string") {
      const parsed = Number(watchedCodAmount);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (watchedCodAmount == null) {
      return 0;
    }

    const parsed = Number(watchedCodAmount);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [watchedCodAmount]);
  const courier = useWatch({ control, name: "courier" });
  const shipmentType = useWatch({ control, name: "shipmentType" });
  const senderPostcode = useWatch({ control, name: "senderPostcode" });
  const recipientPostcode = useWatch({ control, name: "recipientPostcode" });
  const selectedPickupDate = useWatch({ control, name: "pickupDate" });
  const pickupPointId = useWatch({ control, name: "pickupPointId" });
  const pickupPointName = useWatch({ control, name: "pickupPointName" });
  const recipientPointId = useWatch({ control, name: "recipientPointId" });
  const recipientPointName = useWatch({ control, name: "recipientPointName" });
  const packs = useWatch({ control, name: "packs" });
  const insurance = useWatch({ control, name: "insurance" });
  const isCodAllowed = courier ? !isPointBasedCourier(courier) : true;
  const provider = useWatch({ control, name: "provider" });
  const deliveryMethod = useWatch({ control, name: "deliveryMethod" }) as
    | "courier_pickup"
    | "self_delivery";
  const selectedProvider = provider === "epaka" ? "epaka" : "polkurier";
  const providerActions = useMemo(
    () =>
      selectedProvider === "polkurier"
        ? {
            getAvailableCarriers: getPolkurierAvailableCarriers,
            getCourierPickupTime: getPolkurierCourierPickupTime,
            getCourierPoints: getPolkurierCourierPoints,
            getOrderValuation: getPolkurierOrderValuation,
            createOrder: createPolkurierOrder,
            getLabel: getPolkurierLabel,
            updateTracking: updateOrderTracking,
          }
        : {
            getAvailableCarriers: getEpakaAvailableCarriers,
            getCourierPickupTime: getEpakaCourierPickupTime,
            getCourierPoints: getEpakaCourierPoints,
            getOrderValuation: getEpakaOrderValuation,
            createOrder: createEpakaOrder,
            getLabel: getEpakaLabel,
            updateTracking: updateOrderTracking,
          },
    [selectedProvider],
  );
  const pickupPointCollection = useMemo(
    () =>
      createListCollection({
        items: pickupPointOptions,
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
      }),
    [pickupPointOptions],
  );
  const recipientPointCollection = useMemo(
    () =>
      createListCollection({
        items: recipientPointOptions,
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
      }),
    [recipientPointOptions],
  );
  const formatPickupDateLabel = useCallback(
    (date: string) => {
      const parsedDate = new Date(`${date}T00:00:00`);
      if (Number.isNaN(parsedDate.getTime())) {
        return date;
      }

      return new Intl.DateTimeFormat(i18n.resolvedLanguage || undefined, {
        weekday: "long",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(parsedDate);
    },
    [i18n.resolvedLanguage],
  );
  const pickupDateOptions = useMemo(
    () =>
      availableDates.map((date) => ({
        value: date,
        label: formatPickupDateLabel(date),
      })),
    [availableDates, formatPickupDateLabel],
  );
  const formatCourierRouteLabel = useCallback(
    (route: CourierRouteDetails) => {
      const from = t(
        `order.sendParcelForm.route${route.from === "courier" ? "Courier" : "Point"}`,
        {
          defaultValue: route.from === "courier" ? "Courier" : "Point",
        },
      );
      const to = t(
        `order.sendParcelForm.route${route.to === "courier" ? "Courier" : "Point"}`,
        {
          defaultValue: route.to === "courier" ? "Courier" : "Point",
        },
      );

      return t("order.sendParcelForm.routeFlow", {
        defaultValue: "{{from}} → {{to}}",
        from,
        to,
      });
    },
    [t],
  );
  const syncPickupSelection = useCallback(
    (
      nextDates: string[],
      nextTimeSlots: Record<
        string,
        Array<{ timefrom: string; timeto: string }>
      >,
    ) => {
      if (nextDates.length === 0) {
        methods.setValue("pickupDate", "", {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
        methods.setValue("pickupTimeFrom", "", {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
        methods.setValue("pickupTimeTo", "", {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
        return;
      }

      const currentDate = methods.getValues("pickupDate");
      const currentTimeFrom = methods.getValues("pickupTimeFrom");
      const currentTimeTo = methods.getValues("pickupTimeTo");

      const firstDateWithSlots = nextDates.find(
        (date) => (nextTimeSlots[date]?.length ?? 0) > 0,
      );

      const resolvedDate =
        currentDate &&
        nextDates.includes(currentDate) &&
        (nextTimeSlots[currentDate]?.length ?? 0) > 0
          ? currentDate
          : firstDateWithSlots || nextDates[0];

      const resolvedSlots = nextTimeSlots[resolvedDate] ?? [];
      const matchedSlot = resolvedSlots.find(
        (slot) =>
          slot.timefrom === currentTimeFrom && slot.timeto === currentTimeTo,
      );
      const resolvedSlot = matchedSlot || resolvedSlots[0];

      methods.setValue("pickupDate", resolvedDate, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
      methods.setValue("pickupTimeFrom", resolvedSlot?.timefrom ?? "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
      methods.setValue("pickupTimeTo", resolvedSlot?.timeto ?? "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    },
    [methods],
  );

  useEffect(() => {
    let isActive = true;

    const loadProviders = async () => {
      if (process.env.NODE_ENV !== "development") {
        return;
      }

      try {
        const isEpakaAvailable = await isEpakaConfigured();
        if (!isActive) {
          return;
        }

        const nextOptions = [
          ...(isEpakaAvailable ? [{ value: "epaka", label: "Epaka" }] : []),
          { value: "polkurier", label: "Polkurier" },
        ];

        setProviderOptions(nextOptions);

        const currentProvider = methods.getValues("provider");
        if (!nextOptions.some((option) => option.value === currentProvider)) {
          methods.setValue("provider", "polkurier", {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });
        }
      } catch (error) {
        console.error("Error checking Epaka availability:", error);
      }
    };

    loadProviders();

    return () => {
      isActive = false;
    };
  }, [methods]);

  const normalizedSenderPostcode = (senderPostcode || "").trim();
  const normalizedRecipientPostcode = (recipientPostcode || "").trim();

  const normalizedInsurance = useMemo(
    () => normalizeCurrencyValue(insurance),
    [insurance],
  );
  const normalizedCodAmount = useMemo(
    () => normalizeCurrencyValue(codAmount),
    [codAmount],
  );
  const effectiveCodAmount = isCodAllowed ? normalizedCodAmount : 0;

  useEffect(() => {
    if (effectiveCodAmount <= 0) {
      return;
    }

    if (normalizedInsurance >= effectiveCodAmount) {
      return;
    }

    methods.setValue("insurance", effectiveCodAmount, {
      shouldDirty: true,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [effectiveCodAmount, methods, normalizedInsurance]);

  useEffect(() => {
    if (isCodAllowed) {
      return;
    }

    if (codAmount > 0) {
      methods.setValue("codAmount", 0, {
        shouldDirty: true,
        shouldTouch: false,
        shouldValidate: true,
      });
    }

    if (methods.getValues("codBankAccount")) {
      methods.setValue("codBankAccount", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }
  }, [codAmount, isCodAllowed, methods]);

  const availableCourierValues = useMemo(
    () =>
      availableCouriers
        .map((option) => option.value)
        .filter((value) => value && value.length > 0),
    [availableCouriers],
  );

  const courierChoices = useMemo(() => {
    if (availableCouriers.length > 0) {
      return availableCouriers;
    }

    return isLoadingCouriers ? courierOptions : [];
  }, [availableCouriers, isLoadingCouriers]);

  const { packsPayloadArray, packsPayloadCount } = useMemo(() => {
    if (!Array.isArray(packs) || packs.length === 0) {
      return {
        packsPayloadArray: [] as PackPayload[],
        packsPayloadCount: 0,
      };
    }

    const sanitizedPacks: PackPayload[] = packs
      .map((packItem) => {
        if (!packItem) {
          return null;
        }

        const width = Number(packItem.width);
        const height = Number(packItem.height);
        const length = Number(packItem.length);
        const weight = Number(packItem.weight);
        const amount = Number(packItem.amount);
        const type =
          typeof packItem.type === "string"
            ? packItem.type
            : String(packItem.type ?? "");

        const isValid = [width, height, length, weight, amount].every(
          (value) => Number.isFinite(value) && value > 0,
        );

        if (!isValid || type.length === 0) {
          return null;
        }

        return {
          width,
          height,
          length,
          weight,
          amount,
          type,
        } as PackPayload;
      })
      .filter((packItem): packItem is PackPayload => Boolean(packItem));

    if (sanitizedPacks.length === 0) {
      return {
        packsPayloadArray: [] as PackPayload[],
        packsPayloadCount: 0,
      };
    }

    return {
      packsPayloadArray: sanitizedPacks,
      packsPayloadCount: sanitizedPacks.length,
    };
  }, [packs]);

  const canEstimatePrices = useMemo(() => {
    return (
      !isLoadingCouriers &&
      availableCourierValues.length > 0 &&
      typeof shipmentType === "string" &&
      shipmentType.length > 0 &&
      packsPayloadCount > 0 &&
      normalizedSenderPostcode.length > 0 &&
      normalizedRecipientPostcode.length > 0 &&
      !isCalculatingPacks
    );
  }, [
    isLoadingCouriers,
    availableCourierValues,
    shipmentType,
    packsPayloadCount,
    normalizedSenderPostcode,
    normalizedRecipientPostcode,
    isCalculatingPacks,
  ]);

  // Serialize packs for stable dependency comparison
  const packsPayloadSerialized = useMemo(
    () => JSON.stringify(packsPayloadArray),
    [packsPayloadArray],
  );

  // Create SWR key for all-courier price estimation
  const priceEstimationKey = useMemo(() => {
    if (!canEstimatePrices) {
      return null;
    }

    return [
      "courier-valuations",
      selectedProvider,
      shipmentType,
      normalizedSenderPostcode,
      normalizedRecipientPostcode,
      normalizedInsurance,
      effectiveCodAmount,
      packsPayloadSerialized,
    ] as const;
  }, [
    canEstimatePrices,
    shipmentType,
    normalizedSenderPostcode,
    normalizedRecipientPostcode,
    normalizedInsurance,
    effectiveCodAmount,
    packsPayloadSerialized,
    selectedProvider,
  ]);

  // Fetch prices for all couriers in one request
  const {
    data: courierPriceEstimates,
    isLoading: isPriceLoadingRaw,
    isValidating: isPriceValidating,
    error: priceEstimationError,
    mutate: refreshPriceEstimate,
  } = useSWR<CourierPriceEstimate[]>(
    priceEstimationKey,
    async ([
      ,
      ,
      shipmentTypeValue,
      senderPostcodeValue,
      recipientPostcodeValue,
      insuranceValue,
      codValue,
      packsJson,
    ]) => {
      let parsedPacks: PackPayload[] = [];
      try {
        parsedPacks = JSON.parse(packsJson as string);
      } catch {
        parsedPacks = [];
      }

      if (parsedPacks.length === 0) {
        return [];
      }

      try {
        const valuationResult = await providerActions.getOrderValuation({
          shipmentType: shipmentTypeValue as string,
          senderPostcode: senderPostcodeValue as string,
          recipientPostcode: recipientPostcodeValue as string,
          recipientCountry: "PL",
          packs: parsedPacks,
          insurance: insuranceValue as number,
          cod: codValue as number,
        });

        const valuations = Array.isArray(valuationResult.valuations)
          ? valuationResult.valuations
          : [];

        if (!valuationResult.success || valuations.length === 0) {
          return [];
        }

        return valuations
          .filter((valuation) => {
            return (
              typeof valuation.servicecode === "string" &&
              valuation.servicecode.length > 0
            );
          })
          .map((valuation) => ({
            servicecode: valuation.servicecode,
            servicename:
              valuation.servicename && valuation.servicename.length > 0
                ? valuation.servicename
                : valuation.servicecode,
            netprice: valuation.netprice,
            grossprice: valuation.grossprice,
            available: valuation.available,
            unavailable_message: valuation.unavailable_message,
          }));
      } catch (error) {
        console.error("Error fetching courier valuations:", error);
        throw error;
      }
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: true,
    },
  );

  const courierPriceEstimateMap = useMemo<CourierPriceEstimateMap>(() => {
    if (!courierPriceEstimates || courierPriceEstimates.length === 0) {
      return {};
    }

    return courierPriceEstimates.reduce<CourierPriceEstimateMap>(
      (acc, estimate) => {
        acc[estimate.servicecode] = estimate;
        return acc;
      },
      {},
    );
  }, [courierPriceEstimates]);

  const courierSelectionOptions = useMemo<CourierSelectionOption[]>(() => {
    return courierChoices.map((option) => {
      const estimate = courierPriceEstimateMap[option.value];
      const serviceLabel =
        estimate?.servicename && estimate.servicename !== option.label
          ? estimate.servicename
          : undefined;

      return {
        value: option.value,
        label: option.label,
        estimate,
        available: estimate?.available ?? true,
        route: getCourierRouteDetails(
          estimate?.servicename ?? option.label,
          option.value,
        ),
        serviceLabel,
      };
    });
  }, [courierChoices, courierPriceEstimateMap]);

  const estimatedAvailableCourierSelectionOptions = useMemo<
    CourierSelectionOptionWithEstimate[]
  >(() => {
    return courierSelectionOptions.filter(
      (option): option is CourierSelectionOptionWithEstimate =>
        option.available && Boolean(option.estimate),
    );
  }, [courierSelectionOptions]);

  const hasAnyCourierEstimates = useMemo(() => {
    return (courierPriceEstimates?.length ?? 0) > 0;
  }, [courierPriceEstimates]);

  const displayedCourierSelectionOptions = useMemo<
    CourierSelectionOption[]
  >(() => {
    if (hasAnyCourierEstimates) {
      return estimatedAvailableCourierSelectionOptions;
    }

    return courierSelectionOptions;
  }, [
    hasAnyCourierEstimates,
    estimatedAvailableCourierSelectionOptions,
    courierSelectionOptions,
  ]);
  const selectedCourierOption = useMemo(() => {
    if (!courier) {
      return null;
    }

    return (
      displayedCourierSelectionOptions.find(
        (option) => option.value === courier,
      ) ?? null
    );
  }, [courier, displayedCourierSelectionOptions]);
  const selectedCourierRoute = selectedCourierOption?.route ?? null;
  const requiresSenderPoint = selectedCourierRoute?.from === "point";
  const requiresRecipientPoint = selectedCourierRoute?.to === "point";

  const selectedPriceEstimate = useMemo(() => {
    if (!courier) {
      return null;
    }

    return courierPriceEstimateMap[courier] ?? null;
  }, [courier, courierPriceEstimateMap]);

  useEffect(() => {
    if (!displayedCourierSelectionOptions.length) {
      const currentCourier = methods.getValues("courier");
      if (!currentCourier) {
        return;
      }

      methods.setValue("courier", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
      return;
    }

    const currentCourier = methods.getValues("courier");
    const hasCurrentValue = displayedCourierSelectionOptions.some(
      (option) => option.value === currentCourier,
    );

    if (hasCurrentValue) {
      return;
    }

    const preferredCourier =
      findPolkurierCourierForShippingOption(
        order?.shippingOption,
        displayedCourierSelectionOptions,
      ) ?? displayedCourierSelectionOptions[0]?.value;

    if (!preferredCourier) {
      return;
    }

    methods.setValue("courier", preferredCourier, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [displayedCourierSelectionOptions, methods, order?.shippingOption]);

  const isLoadingPrice = Boolean(
    priceEstimationKey && (isPriceLoadingRaw || isPriceValidating),
  );

  // Show error toaster when price estimation fails
  useEffect(() => {
    if (priceEstimationError) {
      console.error("Price estimation error:", priceEstimationError);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("order.sendParcelForm.priceEstimationError", {
          defaultValue:
            "Failed to calculate price. Please check package dimensions and try again.",
        }),
      });
    }
  }, [priceEstimationError, t]);

  const fetchCourierPoints = useCallback(
    async (
      query: string,
      options?: { pointId?: string; isAutoSearch?: boolean },
    ) => {
      if (!courier) {
        return;
      }

      const trimmedQuery = query.trim();
      if (!options?.pointId) {
        if (trimmedQuery.length === 0) {
          return;
        }
        if (trimmedQuery.length < 2) {
          return;
        }
      }

      const requestId = lastPickupPointRequestId.current + 1;
      lastPickupPointRequestId.current = requestId;
      setIsLoadingPickupPoints(true);

      try {
        const requiredFunctions = ["send"] as string[];
        if (effectiveCodAmount > 0) {
          requiredFunctions.push("cod");
        }

        const result = await providerActions.getCourierPoints({
          courier,
          searchQuery: options?.pointId ? undefined : trimmedQuery,
          pointId: options?.pointId,
          functions: requiredFunctions,
          limit: 50,
        });

        if (!result.success || lastPickupPointRequestId.current !== requestId) {
          return;
        }

        const nextOptions = result.points
          .filter((point) => point.id.length > 0)
          .map((point) => ({
            value: point.id,
            label: buildCourierPointLabel(point),
            point,
          }));

        setPickupPointOptions(nextOptions);

        if (pickupPointId) {
          const matched = nextOptions.find(
            (option) => option.value === pickupPointId,
          );
          if (matched) {
            setSelectedPickupPoint(matched.point);
            if (!pickupPointName) {
              methods.setValue(
                "pickupPointName",
                matched.point.name || matched.point.address || matched.point.id,
                {
                  shouldDirty: false,
                  shouldTouch: false,
                  shouldValidate: false,
                },
              );
            }
            if (options?.pointId) {
              setPickupPointInputValue(matched.label);
            }
          } else {
            setSelectedPickupPoint(null);
          }
        } else if (nextOptions.length > 0 && options?.isAutoSearch) {
          // Auto-select first option only for initial auto-searches
          const first = nextOptions[0];
          methods.setValue("pickupPointId", first.value, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
          setSelectedPickupPoint(first.point);
          setPickupPointInputValue(first.label);
          if (!pickupPointName) {
            methods.setValue(
              "pickupPointName",
              first.point.name || first.point.address || first.point.id,
              {
                shouldDirty: false,
                shouldTouch: false,
                shouldValidate: false,
              },
            );
          }
        }
      } catch (error) {
        console.error("Error fetching courier points:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("order.sendParcelForm.pointsError", {
            defaultValue: "Failed to load pickup points",
          }),
        });
      } finally {
        if (lastPickupPointRequestId.current === requestId) {
          setIsLoadingPickupPoints(false);
        }
      }
    },
    [
      courier,
      effectiveCodAmount,
      pickupPointId,
      pickupPointName,
      buildCourierPointLabel,
      methods,
      t,
      providerActions,
    ],
  );

  const schedulePickupPointSearch = useCallback(
    (keyword: string) => {
      if (pickupPointSearchTimeout.current) {
        clearTimeout(pickupPointSearchTimeout.current);
      }

      pickupPointSearchTimeout.current = setTimeout(() => {
        fetchCourierPoints(keyword);
      }, 400);
    },
    [fetchCourierPoints],
  );

  // Recipient point fetching logic
  const fetchRecipientPoints = useCallback(
    async (
      query: string,
      options?: { pointId?: string; isAutoSearch?: boolean },
    ) => {
      if (!courier) {
        return;
      }

      const trimmedQuery = query.trim();
      if (!options?.pointId) {
        if (trimmedQuery.length === 0) {
          return;
        }
        if (trimmedQuery.length < 2) {
          return;
        }
      }

      const requestId = lastRecipientPointRequestId.current + 1;
      lastRecipientPointRequestId.current = requestId;
      setIsLoadingRecipientPoints(true);

      try {
        const requiredFunctions = ["collect"] as string[];
        if (effectiveCodAmount > 0) {
          requiredFunctions.push("cod");
        }

        const result = await providerActions.getCourierPoints({
          courier,
          searchQuery: options?.pointId ? undefined : trimmedQuery,
          pointId: options?.pointId,
          functions: requiredFunctions,
          limit: 50,
        });

        if (
          !result.success ||
          lastRecipientPointRequestId.current !== requestId
        ) {
          return;
        }

        const nextOptions = result.points
          .filter((point) => point.id.length > 0)
          .map((point) => ({
            value: point.id,
            label: buildCourierPointLabel(point),
            point,
          }));

        setRecipientPointOptions(nextOptions);

        if (recipientPointId) {
          const matched = nextOptions.find(
            (option) => option.value === recipientPointId,
          );
          if (matched) {
            setSelectedRecipientPoint(matched.point);
            if (!recipientPointName) {
              methods.setValue(
                "recipientPointName",
                matched.point.name || matched.point.address || matched.point.id,
                {
                  shouldDirty: false,
                  shouldTouch: false,
                  shouldValidate: false,
                },
              );
            }
            if (options?.pointId) {
              setRecipientPointInputValue(matched.label);
            }
          } else {
            setSelectedRecipientPoint(null);
          }
        } else if (nextOptions.length > 0 && options?.isAutoSearch) {
          // Auto-select first option only for initial auto-searches
          const first = nextOptions[0];
          methods.setValue("recipientPointId", first.value, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
          setSelectedRecipientPoint(first.point);
          setRecipientPointInputValue(first.label);
          if (!recipientPointName) {
            methods.setValue(
              "recipientPointName",
              first.point.name || first.point.address || first.point.id,
              {
                shouldDirty: false,
                shouldTouch: false,
                shouldValidate: false,
              },
            );
          }
        }
      } catch (error) {
        console.error("Error fetching recipient points:", error);
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("order.sendParcelForm.recipientPointsError", {
            defaultValue: "Failed to load recipient delivery points",
          }),
        });
      } finally {
        if (lastRecipientPointRequestId.current === requestId) {
          setIsLoadingRecipientPoints(false);
        }
      }
    },
    [
      courier,
      effectiveCodAmount,
      recipientPointId,
      recipientPointName,
      buildCourierPointLabel,
      methods,
      t,
      providerActions,
    ],
  );

  const scheduleRecipientPointSearch = useCallback(
    (keyword: string) => {
      if (recipientPointSearchTimeout.current) {
        clearTimeout(recipientPointSearchTimeout.current);
      }

      recipientPointSearchTimeout.current = setTimeout(() => {
        fetchRecipientPoints(keyword);
      }, 400);
    },
    [fetchRecipientPoints],
  );

  useEffect(
    () => () => {
      if (pickupPointSearchTimeout.current) {
        clearTimeout(pickupPointSearchTimeout.current);
      }
      if (recipientPointSearchTimeout.current) {
        clearTimeout(recipientPointSearchTimeout.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (deliveryMethod === "self_delivery" && courier && requiresSenderPoint) {
      if (
        previousSelfDeliveryCourier.current &&
        previousSelfDeliveryCourier.current !== courier
      ) {
        setPickupPointOptions([]);
        setSelectedPickupPoint(null);
        setPickupPointInputValue("");
        methods.setValue("pickupPointId", "", {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
        methods.setValue("pickupPointName", "", {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }

      previousSelfDeliveryCourier.current = courier;
      return;
    }

    if (deliveryMethod === "self_delivery") {
      if (!courier) {
        setPickupPointOptions([]);
        setSelectedPickupPoint(null);
        setPickupPointInputValue("");
        methods.setValue("pickupPointId", "", {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
        methods.setValue("pickupPointName", "", {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
        previousSelfDeliveryCourier.current = null;
        return;
      }

      previousSelfDeliveryCourier.current = null;
    }

    previousSelfDeliveryCourier.current = courier ?? null;
    setPickupPointOptions([]);
    setSelectedPickupPoint(null);
    setPickupPointInputValue("");
    if (pickupPointId) {
      methods.setValue("pickupPointId", "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
    }
    methods.setValue("pickupPointName", "", {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [courier, deliveryMethod, methods, pickupPointId, requiresSenderPoint]);

  useEffect(() => {
    if (!courier || !requiresRecipientPoint) {
      previousRecipientPointCourier.current = null;
      setRecipientPointOptions([]);
      setSelectedRecipientPoint(null);
      setRecipientPointInputValue("");
      if (recipientPointId) {
        methods.setValue("recipientPointId", "", {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      }
      methods.setValue("recipientPointName", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
      return;
    }

    if (
      previousRecipientPointCourier.current &&
      previousRecipientPointCourier.current !== courier
    ) {
      setRecipientPointOptions([]);
      setSelectedRecipientPoint(null);
      setRecipientPointInputValue("");
      methods.setValue("recipientPointId", "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: false,
      });
      methods.setValue("recipientPointName", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
    }

    previousRecipientPointCourier.current = courier;
  }, [courier, methods, recipientPointId, requiresRecipientPoint]);

  useEffect(() => {
    if (!courier) {
      return;
    }

    const nextDeliveryMethod =
      requiresSenderPoint || isSelfDeliveryCourier(courier)
        ? "self_delivery"
        : deliveryMethod;

    if (
      nextDeliveryMethod === "self_delivery" &&
      deliveryMethod !== nextDeliveryMethod
    ) {
      methods.setValue("deliveryMethod", nextDeliveryMethod, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: true,
      });
    }

    if (nextDeliveryMethod === "self_delivery") {
      setIsLoadingPickupTimes(false);
      methods.setValue("pickupDate", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
      methods.setValue("pickupTimeFrom", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
      methods.setValue("pickupTimeTo", "", {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      });
      setAvailableDates([]);
      setTimeSlots({});
    }
  }, [courier, deliveryMethod, methods, requiresSenderPoint]);

  useEffect(() => {
    if (
      deliveryMethod !== "self_delivery" ||
      !courier ||
      !pickupPointId ||
      !requiresSenderPoint
    ) {
      return;
    }

    const existingOption = pickupPointOptions.find(
      (option) => option.value === pickupPointId,
    );
    if (!existingOption) {
      fetchCourierPoints(pickupPointName || pickupPointId, {
        pointId: pickupPointId,
      });
    } else {
      setSelectedPickupPoint(existingOption.point);
    }
  }, [
    deliveryMethod,
    courier,
    pickupPointId,
    pickupPointName,
    pickupPointOptions,
    fetchCourierPoints,
    requiresSenderPoint,
  ]);

  useEffect(() => {
    if (
      deliveryMethod !== "self_delivery" ||
      !courier ||
      !requiresSenderPoint ||
      pickupPointId
    ) {
      return;
    }

    const senderZip = methods.getValues("senderPostcode")?.trim?.() ?? "";
    const senderCity = methods.getValues("senderCity")?.trim?.() ?? "";
    const defaultQuery = isSelfDeliveryCourier(courier)
      ? senderCity || senderZip
      : senderZip || senderCity;
    if (defaultQuery) {
      setPickupPointInputValue(defaultQuery);
      fetchCourierPoints(defaultQuery, { isAutoSearch: true });
    }
  }, [
    courier,
    deliveryMethod,
    fetchCourierPoints,
    methods,
    pickupPointId,
    requiresSenderPoint,
  ]);

  // Load recipient points when recipient point delivery is needed
  useEffect(() => {
    if (!courier || !requiresRecipientPoint || recipientPointId) {
      return;
    }

    const recipientZip = methods.getValues("recipientPostcode")?.trim?.() ?? "";
    const recipientCity = methods.getValues("recipientCity")?.trim?.() ?? "";
    const defaultQuery = isSelfDeliveryCourier(courier)
      ? recipientCity || recipientZip
      : recipientZip || recipientCity;
    if (defaultQuery) {
      setRecipientPointInputValue(defaultQuery);
      fetchRecipientPoints(defaultQuery, { isAutoSearch: true });
    }
  }, [
    courier,
    recipientPointId,
    fetchRecipientPoints,
    methods,
    requiresRecipientPoint,
  ]);

  // Fetch available carriers on mount
  useEffect(() => {
    const fetchCarriers = async () => {
      setIsLoadingCouriers(true);

      const ensureCourierSelection = (
        options: Array<{ value: string; label: string }>,
      ) => {
        if (!options.length) {
          methods.setValue("courier", "", {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: false,
          });
          return;
        }

        const currentValue = methods.getValues("courier");
        const resolvedValue = options.some(
          (option) => option.value === currentValue,
        )
          ? currentValue
          : (findPolkurierCourierForShippingOption(
              order?.shippingOption,
              options,
            ) ?? options[0].value);

        if (resolvedValue !== currentValue) {
          methods.setValue("courier", resolvedValue, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });

          // Update delivery method based on courier type
          const currentDeliveryMethod = methods.getValues("deliveryMethod");
          const newDeliveryMethod = isSelfDeliveryCourier(resolvedValue)
            ? "self_delivery"
            : currentDeliveryMethod;
          if (
            newDeliveryMethod === "self_delivery" &&
            currentDeliveryMethod !== newDeliveryMethod
          ) {
            methods.setValue("deliveryMethod", newDeliveryMethod, {
              shouldDirty: false,
              shouldTouch: false,
              shouldValidate: true,
            });
          }
        }
      };

      try {
        const selectedWh = getSelectedWarehouse();
        const result = await providerActions.getAvailableCarriers({
          senderPostcode: selectedWh?.address?.zip,
          recipientPostcode: order?.shipping?.zip,
          recipientCountry: "PL",
        });

        if (result.success) {
          const carrierOptions = result.carriers
            .filter((carrier) => carrier.servicecode.length > 0)
            .map((carrier) => ({
              value: carrier.servicecode,
              label: carrier.name,
            }));
          setAvailableCouriers(carrierOptions);
          ensureCourierSelection(carrierOptions);
          return;
        }
      } catch (error) {
        console.error("Error fetching carriers:", error);
        // Fallback to default couriers if API fails
        const fallbackCouriers = [
          { value: "INPOST", label: "InPost" },
          { value: "DPD", label: "DPD" },
          { value: "DHL", label: "DHL" },
          { value: "UPS", label: "UPS" },
        ];
        setAvailableCouriers(fallbackCouriers);
        ensureCourierSelection(fallbackCouriers);
      } finally {
        setIsLoadingCouriers(false);
      }
    };

    fetchCarriers();
  }, [
    selectedWarehouseId,
    order?.shipping?.zip,
    order?.shippingOption,
    methods,
    providerActions,
  ]);

  // Fetch courier pickup times when courier or shipment type changes
  useEffect(() => {
    let isActive = true;

    const fetchPickupTimes = async () => {
      if (!courier || !shipmentType || deliveryMethod !== "courier_pickup") {
        setIsLoadingPickupTimes(false);
        return;
      }

      const requestId = lastPickupTimeRequestId.current + 1;
      lastPickupTimeRequestId.current = requestId;

      // Helper: build a safe fallback schedule (next weekdays with a generic slot)
      const buildFallbackSchedule = (days: number = 10) => {
        const dates: string[] = [];
        const slots: Record<
          string,
          Array<{ timefrom: string; timeto: string }>
        > = {};

        const pad = (n: number) => String(n).padStart(2, "0");
        const toLocalISODate = (d: Date) => {
          const y = d.getFullYear();
          const m = pad(d.getMonth() + 1);
          const day = pad(d.getDate());
          return `${y}-${m}-${day}`;
        };

        let cursor = new Date();

        while (dates.length < days) {
          const dow = cursor.getDay(); // 0=Sun,6=Sat
          if (dow !== 0 && dow !== 6) {
            const iso = toLocalISODate(cursor);
            dates.push(iso);
            // Provide a conservative default slot; actual creation will validate server-side
            slots[iso] = [{ timefrom: "10:00", timeto: "14:00" }];
          }
          cursor.setDate(cursor.getDate() + 1);
        }

        return { dates, slots };
      };

      setIsLoadingPickupTimes(true);
      try {
        const result = await providerActions.getCourierPickupTime({
          courier,
          shipmentType,
          shipFrom: senderPostcode,
        });

        if (!isActive || lastPickupTimeRequestId.current !== requestId) {
          return;
        }

        if (result.success) {
          const nextDates = result.dates.filter(
            (date): date is string =>
              typeof date === "string" && date.length > 0,
          );
          const nextTimeSlots = result.timeSlots;

          const hasUsablePickupSchedule = nextDates.some(
            (date) => (nextTimeSlots[date]?.length ?? 0) > 0,
          );

          if (!hasUsablePickupSchedule) {
            const fallback = buildFallbackSchedule(10);
            setAvailableDates(fallback.dates);
            setTimeSlots(fallback.slots);
            syncPickupSelection(fallback.dates, fallback.slots);
            return;
          }

          setAvailableDates(nextDates);
          setTimeSlots(nextTimeSlots);
          syncPickupSelection(nextDates, nextTimeSlots);
        }
      } catch (error) {
        if (!isActive || lastPickupTimeRequestId.current !== requestId) {
          return;
        }

        console.error("Error fetching pickup times:", error);
        // Graceful fallback: enable user to pick a later date even if API rejects current day
        const fallback = buildFallbackSchedule(10);
        setAvailableDates(fallback.dates);
        setTimeSlots(fallback.slots);
        syncPickupSelection(fallback.dates, fallback.slots);

        const now = Date.now();
        if (
          now - lastPickupFallbackToastAtRef.current >=
          PICKUP_TIMES_FALLBACK_TOAST_COOLDOWN_MS
        ) {
          lastPickupFallbackToastAtRef.current = now;
          toaster.error({
            title: t("common.error", { defaultValue: "Error" }),
            description: t(
              "order.sendParcelForm.pickupTimesErrorWithFallback",
              {
                defaultValue:
                  "Today's pickup is unavailable. Select a later date from the list.",
              },
            ),
          });
        }
      } finally {
        if (isActive && lastPickupTimeRequestId.current === requestId) {
          setIsLoadingPickupTimes(false);
        }
      }
    };

    void fetchPickupTimes();

    return () => {
      isActive = false;
    };
  }, [
    courier,
    shipmentType,
    senderPostcode,
    deliveryMethod,
    t,
    providerActions,
    syncPickupSelection,
  ]);

  // Get time options for selected date
  const getTimeOptionsForDate = (date: string) => {
    const slots = timeSlots[date] || [];
    return slots.map((slot) => ({
      value: slot.timefrom,
      label: `${slot.timefrom} - ${slot.timeto}`,
      timeto: slot.timeto,
    }));
  };

  const currentTimeOptions = selectedPickupDate
    ? getTimeOptionsForDate(selectedPickupDate)
    : [];

  const onSubmit = async (data: SendParcelFormData) => {
    setIsSubmitting(true);

    try {
      const codAmountForApi = isCodAllowed
        ? normalizeCurrencyValue(data.codAmount)
        : 0;
      const insuranceForApi = normalizeCurrencyValue(data.insurance);

      // Prepare sender data from form
      const senderData = {
        name: data.senderPerson.trim(),
        company: data.senderCompany?.trim() || undefined,
        street: data.senderStreet.trim(),
        zip: data.senderPostcode.trim(),
        city: data.senderCity.trim(),
        email: data.senderEmail.trim(),
        phone: data.senderPhone.trim(),
        country: data.senderCountry.trim(),
      };

      // Prepare recipient data from form
      const recipientData = {
        name: data.recipientPerson.trim(),
        company: data.recipientCompany?.trim() || undefined,
        street: data.recipientStreet.trim(),
        zip: data.recipientPostcode.trim(),
        city: data.recipientCity.trim(),
        email: data.recipientEmail.trim(),
        phone: data.recipientPhone.trim(),
        country: data.recipientCountry.trim(),
      };

      // Prepare packs data
      const packs =
        data.packs?.map((pack) => ({
          width: pack.width,
          height: pack.height,
          length: pack.length,
          weight: pack.weight,
          amount: pack.amount,
          type: pack.type,
        })) || [];

      // Call server action with first pack (API supports single pack for now)
      const firstPack = packs[0];
      if (!firstPack) {
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("order.sendParcelForm.noPacks", {
            defaultValue: "At least one package is required",
          }),
        });
        return;
      }

      const senderPointId =
        data.deliveryMethod === "self_delivery" && requiresSenderPoint
          ? data.pickupPointId?.trim() || undefined
          : undefined;

      const resolvedRecipientPointId = requiresRecipientPoint
        ? data.recipientPointId?.trim() || undefined
        : undefined;

      const result = await providerActions.createOrder({
        courier: data.courier,
        shipmentType: data.shipmentType,
        description: data.description,
        packWidth: firstPack.width,
        packHeight: firstPack.height,
        packLength: firstPack.length,
        packWeight: firstPack.weight,
        packAmount: firstPack.amount,
        packType: firstPack.type,
        pickupDate: data.pickupDate,
        pickupTimeFrom: data.pickupTimeFrom,
        pickupTimeTo: data.pickupTimeTo,
        noCourierOrder: data.deliveryMethod === "self_delivery",
        multiPickup: false,
        codAmount: codAmountForApi,
        codBankAccount: isCodAllowed ? data.codBankAccount : undefined,
        insurance: insuranceForApi,
        senderPointId,
        recipientPointId: resolvedRecipientPointId,
        sender: senderData,
        recipient: recipientData,
      });

      // Store the created order ID
      setCreatedOrderNumber(result.orderNumber);
      setIsCreatedOrderLabelReady(
        "isLabelReady" in result ? result.isLabelReady : false,
      );
      // Update order tracking information if we have tracking data
      if (
        result.trackingUrl &&
        result.trackingNumber &&
        result.shippingOption &&
        order?.channelId
      ) {
        try {
          await providerActions.updateTracking({
            orderId: order.id,
            channelId: order.channelId,
            tracking: {
              number: result.trackingNumber,
              shippingOption: result.shippingOption,
              link: result.trackingUrl,
            },
          });
        } catch (trackingError) {
          console.error("Error updating order tracking:", trackingError);
          // Don't show error to user - this is a background operation
          // The main parcel creation was successful
        }
      }

      toaster.success({
        title: t("common.success", { defaultValue: "Success" }),
        description: t("order.sendParcelForm.success", {
          defaultValue:
            "Parcel order created successfully. Order ID: {{orderId}}",
          orderId: result.orderNumber,
        }),
      });

      // Automatically download the label when Polkurier already reports one.
      if ("isLabelReady" in result && result.isLabelReady) {
        try {
          const labelResult = await providerActions.getLabel([
            result.orderNumber,
          ]);

          if (labelResult.success && labelResult.file) {
            // Convert base64 to blob and download
            const byteCharacters = atob(labelResult.file);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `label-${result.orderNumber}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toaster.success({
              title: t("common.success", { defaultValue: "Success" }),
              description: t("order.sendParcelForm.labelDownloaded", {
                defaultValue: "Label downloaded successfully",
              }),
            });
          }
        } catch (labelError) {
          console.error("Error downloading label automatically:", labelError);
          toaster.create({
            type: "info",
            title: t("common.info", { defaultValue: "Information" }),
            description: t("order.sendParcelForm.labelAutoDownloadError", {
              defaultValue:
                "Label could not be downloaded automatically. Use the Download Label button.",
            }),
          });
        }
      } else {
        toaster.create({
          type: "info",
          title: t("common.info", { defaultValue: "Information" }),
          description: t("order.sendParcelForm.labelNotReady", {
            defaultValue:
              "The shipping label is not ready yet. Try downloading it again in a moment.",
          }),
        });
      }

      // Don't navigate away immediately - show success card with download option
      if (onSuccess) {
        onSuccess(result.orderNumber);
      }
    } catch (error) {
      console.error("Error creating parcel order:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error
            ? error.message
            : t("order.sendParcelForm.error", {
                defaultValue: "Failed to create parcel order",
              }),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadLabel = async () => {
    if (!createdOrderNumber) return;

    try {
      const result = await providerActions.getLabel([createdOrderNumber]);

      if (result.success && result.file) {
        // Convert base64 to blob and download
        const byteCharacters = atob(result.file);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `label-${createdOrderNumber}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toaster.success({
          title: t("common.success", { defaultValue: "Success" }),
          description: t("order.sendParcelForm.labelDownloaded", {
            defaultValue: "Label downloaded successfully",
          }),
        });
        setIsCreatedOrderLabelReady(true);
        setIsCreatedOrderLabelReady(true);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : undefined;

      if (
        errorMessage?.includes("label is not available yet") ||
        errorMessage?.includes("did not return file")
      ) {
        toaster.create({
          type: "info",
          title: t("common.info", { defaultValue: "Information" }),
          description: t("order.sendParcelForm.labelNotReady", {
            defaultValue:
              "The shipping label is not ready yet. Try downloading it again in a moment.",
          }),
        });
        return;
      }

      console.error("Error downloading label:", error);
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("order.sendParcelForm.labelError", {
          defaultValue: "Failed to download label",
        }),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Container maxW={"7xl"}>
        <VStack gap={6} align="stretch">
          <Card.Root>
            <Card.Body>
              <VStack align="stretch" gap={3}>
                <VStack align="stretch" gap={1}>
                  <Text fontWeight="medium">
                    {t("order.sendParcelForm.provider", {
                      defaultValue: "Shipping provider",
                    })}
                  </Text>
                  <Controller
                    name="provider"
                    control={control}
                    render={({ field }) => {
                      return (
                        <Select.Root
                          collection={createListCollection({
                            items: providerOptions,
                          })}
                          value={
                            typeof field.value === "string" &&
                            field.value.length > 0
                              ? [field.value]
                              : []
                          }
                          onValueChange={(e) =>
                            field.onChange(e.value[0] ?? "")
                          }
                        >
                          <Select.Trigger>
                            <Select.ValueText
                              placeholder={t(
                                "order.sendParcelForm.selectProvider",
                                { defaultValue: "Select provider" },
                              )}
                            />
                          </Select.Trigger>
                          <Select.Positioner>
                            <Select.Content>
                              {providerOptions.map((item) => (
                                <Select.Item key={item.value} item={item}>
                                  {item.label}
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Positioner>
                        </Select.Root>
                      );
                    }}
                  />
                </VStack>
                {selectedProvider === "epaka" && (
                  <Alert.Root status="info" w="full">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {t("order.sendParcelForm.epakaAuthTitle", {
                          defaultValue: "Epaka authorization",
                        })}
                      </Alert.Title>
                      <Alert.Description>
                        <VStack align="start" gap={3} mt={2}>
                          <Text>
                            {t("order.sendParcelForm.epakaAuthDesc", {
                              defaultValue:
                                "Authorize epaka to issue tokens for booking and labels. Tokens are stored securely on this device.",
                            })}
                          </Text>
                          <HStack gap={3}>
                            <Button asChild size="sm">
                              <a href="/epaka/oauth/login">
                                {t("order.sendParcelForm.epakaAuthButton", {
                                  defaultValue: "Authorize epaka",
                                })}
                              </a>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <a href="/epaka/oauth/callback">
                                {t("order.sendParcelForm.epakaAuthStatus", {
                                  defaultValue: "Check status",
                                })}
                              </a>
                            </Button>
                          </HStack>
                        </VStack>
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}
              </VStack>
            </Card.Body>
          </Card.Root>

          {/* Validation Errors Card - Show when there are errors */}
          {Object.keys(errors).length > 0 && (
            <Alert.Root status="error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t("order.sendParcelForm.validationErrors", {
                    defaultValue: "Please fix the following errors:",
                  })}
                </Alert.Title>
                <Alert.Description>
                  <VStack align="stretch" gap={1} mt={2}>
                    {Object.entries(errors).map(([key, error]) => {
                      if (
                        error &&
                        typeof error === "object" &&
                        "message" in error
                      ) {
                        return (
                          <Text key={key} fontSize="sm">
                            • {String(error.message)}
                          </Text>
                        );
                      }
                      return null;
                    })}
                  </VStack>
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}

          {/* Success Card - Show after order creation */}
          {createdOrderNumber && (
            <Card.Root colorPalette="success" borderWidth="2px">
              <Card.Body>
                <VStack gap={4} align="stretch">
                  <HStack align="center" gap={2}>
                    <MaterialSymbol>check_circle</MaterialSymbol>
                    <Text fontSize="lg" fontWeight="bold">
                      {t("order.sendParcelForm.orderCreated", {
                        defaultValue: "Order Created Successfully!",
                      })}
                    </Text>
                  </HStack>
                  <Text>
                    {t("order.sendParcelForm.orderIdLabel", {
                      defaultValue: "Order ID:",
                    })}{" "}
                    <Badge>{createdOrderNumber}</Badge>
                  </Text>
                  <Alert.Root
                    status={isCreatedOrderLabelReady ? "success" : "info"}
                    variant="subtle"
                  >
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        {isCreatedOrderLabelReady
                          ? t("order.sendParcelForm.labelStatusReadyTitle", {
                              defaultValue: "Label Ready",
                            })
                          : t("order.sendParcelForm.labelStatusPendingTitle", {
                              defaultValue: "Label Pending",
                            })}
                      </Alert.Title>
                      <Alert.Description>
                        {isCreatedOrderLabelReady
                          ? t(
                              "order.sendParcelForm.labelStatusReadyDescription",
                              {
                                defaultValue:
                                  "The shipping label is available and ready to download.",
                              },
                            )
                          : t(
                              "order.sendParcelForm.labelStatusPendingDescription",
                              {
                                defaultValue:
                                  "The order was created successfully, but Polkurier may need a moment to generate the label.",
                              },
                            )}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                  <HStack gap={2} align="stretch">
                    <Button onClick={handleDownloadLabel} size="sm">
                      <MaterialSymbol>download</MaterialSymbol>
                      {t("order.sendParcelForm.downloadLabel", {
                        defaultValue: "Download Label",
                      })}
                    </Button>
                    {order?.id ? (
                      <Button
                        onClick={() =>
                          router.push(
                            `/${i18n.resolvedLanguage}/orders/${order.id}`,
                          )
                        }
                        variant="outline"
                        size="sm"
                      >
                        <MaterialSymbol>arrow_back</MaterialSymbol>
                        {t("order.sendParcelForm.backToOrder", {
                          defaultValue: "Back to Order",
                        })}
                      </Button>
                    ) : null}
                  </HStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          {/* Layout rows: package details, sender/recipient, then remaining sections */}
          <VStack gap={6} align="stretch">
            {/* Top row: Package Details */}
            <VStack gap={6} align="stretch">
              {/* 1. Package Details - Field Array */}
              <Fieldset.Root>
                <Fieldset.Legend>
                  <HStack align="center" justify="space-between">
                    <Text>
                      {t("order.sendParcelForm.packageDetails", {
                        defaultValue: "Package Details",
                      })}
                    </Text>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        append({
                          width: 10,
                          height: 10,
                          length: 10,
                          weight: 1,
                          amount: 1,
                          type: PackType.ST,
                        })
                      }
                    >
                      <MaterialSymbol>add</MaterialSymbol>
                      {t("order.sendParcelForm.addPackage", {
                        defaultValue: "Add Package",
                      })}
                    </Button>
                  </HStack>
                </Fieldset.Legend>
                <Fieldset.Content>
                  {/* AI Pre-calculation Info */}
                  {packsPreCalculated && (
                    <Alert.Root status="info">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>
                          {t("order.sendParcelForm.aiPreCalculated", {
                            defaultValue: "AI Pre-calculated",
                          })}
                        </Alert.Title>
                        <Alert.Description>
                          {t(
                            "order.sendParcelForm.aiPreCalculatedDescription",
                            {
                              defaultValue:
                                "Package dimensions and weights were automatically calculated based on order items. Please verify and adjust if needed.",
                            },
                          )}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}

                  {isCalculatingPacks && (
                    <Alert.Root status="info">
                      <Spinner size="sm" mr={2} />
                      <Alert.Content>
                        <Alert.Description>
                          {t("order.sendParcelForm.calculatingPacks", {
                            defaultValue: "Calculating optimal packaging...",
                          })}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}

                  <VStack gap={6} align="stretch">
                    {fields.map((field, index) => (
                      <VStack
                        key={field.id}
                        gap={4}
                        p={4}
                        borderWidth="1px"
                        borderRadius="3xl"
                        position="relative"
                        align="stretch"
                      >
                        {fields.length > 1 && (
                          <IconButton
                            position="absolute"
                            top={2}
                            right={2}
                            size="sm"
                            variant="ghost"
                            colorPalette="red"
                            onClick={() => remove(index)}
                            aria-label={t(
                              "order.sendParcelForm.removePackage",
                              { defaultValue: "Remove package" },
                            )}
                          >
                            <MaterialSymbol>delete</MaterialSymbol>
                          </IconButton>
                        )}
                        <Text fontWeight="medium">
                          {t("order.sendParcelForm.package", {
                            defaultValue: "Package",
                          })}{" "}
                          #{index + 1}
                        </Text>
                        <SimpleGrid columns={[1, 2, 3]} gap={4}>
                          <Field
                            label={t("order.sendParcelForm.length", {
                              defaultValue: "Length (cm)",
                            })}
                            invalid={!!errors.packs?.[index]?.length}
                            errorText={errors.packs?.[index]?.length?.message}
                          >
                            <Controller
                              name={`packs.${index}.length`}
                              control={control}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  type="number"
                                  min={1}
                                  onChange={(e) =>
                                    field.onChange(Number(e.target.value))
                                  }
                                />
                              )}
                            />
                          </Field>

                          <Field
                            label={t("order.sendParcelForm.width", {
                              defaultValue: "Width (cm)",
                            })}
                            invalid={!!errors.packs?.[index]?.width}
                            errorText={errors.packs?.[index]?.width?.message}
                          >
                            <Controller
                              name={`packs.${index}.width`}
                              control={control}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  type="number"
                                  min={1}
                                  onChange={(e) =>
                                    field.onChange(Number(e.target.value))
                                  }
                                />
                              )}
                            />
                          </Field>

                          <Field
                            label={t("order.sendParcelForm.height", {
                              defaultValue: "Height (cm)",
                            })}
                            invalid={!!errors.packs?.[index]?.height}
                            errorText={errors.packs?.[index]?.height?.message}
                          >
                            <Controller
                              name={`packs.${index}.height`}
                              control={control}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  type="number"
                                  min={1}
                                  onChange={(e) =>
                                    field.onChange(Number(e.target.value))
                                  }
                                />
                              )}
                            />
                          </Field>

                          <Field
                            label={t("order.sendParcelForm.weight", {
                              defaultValue: "Weight (kg)",
                            })}
                            invalid={!!errors.packs?.[index]?.weight}
                            errorText={errors.packs?.[index]?.weight?.message}
                          >
                            <Controller
                              name={`packs.${index}.weight`}
                              control={control}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  type="number"
                                  min={0.1}
                                  step={0.1}
                                  onChange={(e) =>
                                    field.onChange(Number(e.target.value))
                                  }
                                />
                              )}
                            />
                          </Field>

                          <Field
                            label={t("order.sendParcelForm.amount", {
                              defaultValue: "Amount",
                            })}
                            invalid={!!errors.packs?.[index]?.amount}
                            errorText={errors.packs?.[index]?.amount?.message}
                          >
                            <Controller
                              name={`packs.${index}.amount`}
                              control={control}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  type="number"
                                  min={1}
                                  max={99}
                                  onChange={(e) =>
                                    field.onChange(Number(e.target.value))
                                  }
                                />
                              )}
                            />
                          </Field>

                          <Field
                            label={t("order.sendParcelForm.packType", {
                              defaultValue: "Pack Type",
                            })}
                            invalid={!!errors.packs?.[index]?.type}
                            errorText={errors.packs?.[index]?.type?.message}
                          >
                            <Controller
                              name={`packs.${index}.type`}
                              control={control}
                              render={({ field }) => (
                                <Select.Root
                                  collection={createListCollection({
                                    items: packTypeOptions,
                                  })}
                                  value={
                                    typeof field.value === "string" &&
                                    field.value.length > 0
                                      ? [field.value]
                                      : []
                                  }
                                  onValueChange={(e) =>
                                    field.onChange(e.value[0] ?? "")
                                  }
                                >
                                  <Select.Trigger>
                                    <Select.ValueText
                                      placeholder={t(
                                        "order.sendParcelForm.selectType",
                                        { defaultValue: "Select type" },
                                      )}
                                    />
                                  </Select.Trigger>
                                  <Select.Positioner>
                                    <Select.Content>
                                      <For each={packTypeOptions}>
                                        {(item) => (
                                          <Select.Item
                                            key={item.value}
                                            item={item}
                                          >
                                            {item.label}
                                          </Select.Item>
                                        )}
                                      </For>
                                    </Select.Content>
                                  </Select.Positioner>
                                </Select.Root>
                              )}
                            />
                          </Field>
                        </SimpleGrid>
                      </VStack>
                    ))}
                  </VStack>
                </Fieldset.Content>
              </Fieldset.Root>
            </VStack>

            {/* Second row: Sender and recipient */}
            <SimpleGrid columns={{ base: 1, lg: 2 }} gap={6} alignItems="start">
              <VStack gap={6} align="stretch">
                {/* Sender Details */}
                <Fieldset.Root>
                  <Fieldset.Legend>
                    {t("order.sendParcelForm.sender", {
                      defaultValue: "Sender (Warehouse)",
                    })}
                  </Fieldset.Legend>
                  <Fieldset.Content>
                    <VStack gap={4} align="stretch">
                      {/* Warehouse Selector */}
                      {warehouseOptions.length > 0 && (
                        <Field
                          label={t("order.sendParcelForm.selectWarehouse", {
                            defaultValue: "Select Warehouse",
                          })}
                          helperText={t(
                            "order.sendParcelForm.warehouseHelper",
                            {
                              defaultValue: "Choose sender warehouse address",
                            },
                          )}
                        >
                          <Select.Root
                            collection={createListCollection({
                              items: warehouseOptions,
                            })}
                            value={[selectedWarehouseId]}
                            onValueChange={(e) =>
                              setSelectedWarehouseId(e.value[0])
                            }
                          >
                            <Select.Trigger>
                              <Select.ValueText
                                placeholder={t(
                                  "order.sendParcelForm.selectWarehouse",
                                  { defaultValue: "Select warehouse" },
                                )}
                              />
                            </Select.Trigger>
                            <Select.Positioner>
                              <Select.Content>
                                <For each={warehouseOptions}>
                                  {(item) => (
                                    <Select.Item key={item.value} item={item}>
                                      {item.label}
                                    </Select.Item>
                                  )}
                                </For>
                              </Select.Content>
                            </Select.Positioner>
                          </Select.Root>
                        </Field>
                      )}

                      {/* Pickup Point Selector - Show when self_delivery is selected AND courier supports points */}
                      {deliveryMethod === "self_delivery" &&
                        requiresSenderPoint && (
                          <>
                            <Card.Root colorPalette="blue" variant="subtle">
                              <Card.Body>
                                <HStack gap={2} align="center">
                                  <MaterialSymbol>info</MaterialSymbol>
                                  <Text fontSize="sm">
                                    {t(
                                      "order.sendParcelForm.selfDeliveryInfo",
                                      {
                                        defaultValue:
                                          "You will deliver the package to the selected pickup point yourself.",
                                      },
                                    )}
                                  </Text>
                                </HStack>
                              </Card.Body>
                            </Card.Root>
                            <Field
                              label={t(
                                "order.sendParcelForm.senderPickupPoint",
                                {
                                  defaultValue: "Sender Pickup Point",
                                },
                              )}
                              helperText={t(
                                "order.sendParcelForm.senderPickupPointHelper",
                                {
                                  defaultValue:
                                    "Select the point where you will drop off the package (min. 2 characters to search)",
                                },
                              )}
                              invalid={!!errors.pickupPointId}
                              errorText={errors.pickupPointId?.message}
                            >
                              <Controller
                                name="pickupPointId"
                                control={control}
                                render={({ field }) => (
                                  <Combobox.Root
                                    collection={pickupPointCollection}
                                    value={field.value ? [field.value] : []}
                                    inputValue={pickupPointInputValue}
                                    onValueChange={({ value }) => {
                                      const selectedValue = value[0] ?? "";
                                      field.onChange(selectedValue);
                                      if (!selectedValue) {
                                        setSelectedPickupPoint(null);
                                        setPickupPointInputValue("");
                                        methods.setValue(
                                          "pickupPointName",
                                          "",
                                          {
                                            shouldDirty: false,
                                            shouldTouch: true,
                                            shouldValidate: false,
                                          },
                                        );
                                        return;
                                      }
                                      const selectedOption =
                                        pickupPointOptions.find(
                                          (opt) => opt.value === selectedValue,
                                        );
                                      if (selectedOption) {
                                        setSelectedPickupPoint(
                                          selectedOption.point,
                                        );
                                        setPickupPointInputValue(
                                          selectedOption.label,
                                        );
                                        methods.setValue(
                                          "pickupPointName",
                                          selectedOption.point.name ||
                                            selectedOption.point.address ||
                                            selectedOption.point.id,
                                          {
                                            shouldDirty: false,
                                            shouldTouch: false,
                                            shouldValidate: false,
                                          },
                                        );
                                      }
                                    }}
                                    onInputValueChange={({ inputValue }) => {
                                      setPickupPointInputValue(inputValue);
                                      schedulePickupPointSearch(inputValue);
                                    }}
                                    disabled={!courier}
                                    openOnClick
                                  >
                                    <Combobox.Control>
                                      <Combobox.Input
                                        placeholder={
                                          !courier
                                            ? t(
                                                "order.sendParcelForm.selectCourierFirst",
                                                {
                                                  defaultValue:
                                                    "Select courier first",
                                                },
                                              )
                                            : isLoadingPickupPoints
                                              ? t(
                                                  "order.sendParcelForm.loadingPoints",
                                                  {
                                                    defaultValue:
                                                      "Loading points...",
                                                  },
                                                )
                                              : t(
                                                  "order.sendParcelForm.searchPoint",
                                                  {
                                                    defaultValue:
                                                      "Search pickup point...",
                                                  },
                                                )
                                        }
                                      />
                                      <Combobox.IndicatorGroup>
                                        {isLoadingPickupPoints && (
                                          <Spinner size="xs" />
                                        )}
                                        <Combobox.ClearTrigger />
                                        <Combobox.Trigger />
                                      </Combobox.IndicatorGroup>
                                    </Combobox.Control>
                                    <Combobox.Positioner>
                                      <Combobox.Content>
                                        {isLoadingPickupPoints ? (
                                          <Combobox.Empty>
                                            <HStack gap={2}>
                                              <Spinner size="sm" />
                                              <Text fontSize="sm">
                                                {t(
                                                  "order.sendParcelForm.loadingPoints",
                                                  {
                                                    defaultValue:
                                                      "Loading points...",
                                                  },
                                                )}
                                              </Text>
                                            </HStack>
                                          </Combobox.Empty>
                                        ) : pickupPointOptions.length === 0 ? (
                                          <Combobox.Empty>
                                            <Text
                                              fontSize="sm"
                                              color="fg.muted"
                                            >
                                              {t(
                                                "order.sendParcelForm.noPointsFound",
                                                {
                                                  defaultValue:
                                                    "No points found",
                                                },
                                              )}
                                            </Text>
                                          </Combobox.Empty>
                                        ) : (
                                          pickupPointOptions.map((option) => (
                                            <Combobox.Item
                                              key={option.value}
                                              item={option}
                                            >
                                              {option.label}
                                              <Combobox.ItemIndicator />
                                            </Combobox.Item>
                                          ))
                                        )}
                                      </Combobox.Content>
                                    </Combobox.Positioner>
                                  </Combobox.Root>
                                )}
                              />
                            </Field>
                            {selectedPickupPoint && (
                              <Card.Root variant="outline" borderWidth="1px">
                                <Card.Body>
                                  <VStack align="stretch" gap={2}>
                                    <Text fontSize="sm" color="fg.muted">
                                      {selectedPickupPoint.address ||
                                        [
                                          selectedPickupPoint.street,
                                          selectedPickupPoint.zip,
                                          selectedPickupPoint.city,
                                        ]
                                          .filter(Boolean)
                                          .join(", ")}
                                    </Text>
                                    {selectedPickupPoint.openingHours && (
                                      <HStack gap={1}>
                                        <Text fontSize="xs" color="fg.muted">
                                          {selectedPickupPoint.openingHours}
                                        </Text>
                                      </HStack>
                                    )}
                                    {selectedPickupPoint.description && (
                                      <Text fontSize="xs" color="fg.muted">
                                        {selectedPickupPoint.description}
                                      </Text>
                                    )}
                                  </VStack>
                                </Card.Body>
                              </Card.Root>
                            )}
                          </>
                        )}

                      <Field
                        label={t("order.sendParcelForm.person", {
                          defaultValue: "Name",
                        })}
                        invalid={!!errors.senderPerson}
                        errorText={errors.senderPerson?.message}
                      >
                        <Controller
                          name="senderPerson"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder={t("order.sendParcelForm.name", {
                                defaultValue: "Name",
                              })}
                            />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.company", {
                          defaultValue: "Company (optional)",
                        })}
                        invalid={!!errors.senderCompany}
                        errorText={errors.senderCompany?.message}
                      >
                        <Controller
                          name="senderCompany"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder={t("order.sendParcelForm.company", {
                                defaultValue: "Company name",
                              })}
                            />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.street", {
                          defaultValue: "Street",
                        })}
                        invalid={!!errors.senderStreet}
                        errorText={errors.senderStreet?.message}
                        helperText={t("order.sendParcelForm.streetHelper", {
                          defaultValue:
                            "Enter full address (e.g., 'Example Street 10/5' or 'Example Avenue 12 m. 3')",
                        })}
                      >
                        <Controller
                          name="senderStreet"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder={t("order.sendParcelForm.street", {
                                defaultValue: "Street",
                              })}
                              onBlur={(e) => {
                                field.onBlur();
                                const parsed = parseStreetAddress(
                                  e.target.value,
                                );
                                const formatted = formatStreetLine(
                                  parsed.street || e.target.value.trim(),
                                  parsed.number || null,
                                  parsed.flat || null,
                                );
                                if (formatted) {
                                  methods.setValue("senderStreet", formatted);
                                }
                              }}
                            />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.postcode", {
                          defaultValue: "Postcode",
                        })}
                        invalid={!!errors.senderPostcode}
                        errorText={errors.senderPostcode?.message}
                      >
                        <Controller
                          name="senderPostcode"
                          control={control}
                          render={({ field }) => (
                            <Input {...field} placeholder="00-000" />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.city", {
                          defaultValue: "City",
                        })}
                        invalid={!!errors.senderCity}
                        errorText={errors.senderCity?.message}
                      >
                        <Controller
                          name="senderCity"
                          control={control}
                          render={({ field }) => (
                            <Input {...field} placeholder="Warsaw" />
                          )}
                        />
                      </Field>

                      <SimpleGrid columns={[1, 2]} gap={4}>
                        <Field
                          label={t("order.sendParcelForm.email", {
                            defaultValue: "Email",
                          })}
                          invalid={!!errors.senderEmail}
                          errorText={errors.senderEmail?.message}
                        >
                          <Controller
                            name="senderEmail"
                            control={control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                type="email"
                                placeholder="email@example.com"
                              />
                            )}
                          />
                        </Field>

                        <Field
                          label={t("order.sendParcelForm.phone", {
                            defaultValue: "Phone",
                          })}
                          invalid={!!errors.senderPhone}
                          errorText={errors.senderPhone?.message}
                        >
                          <Controller
                            name="senderPhone"
                            control={control}
                            render={({ field }) => (
                              <Input {...field} placeholder="+48 123 456 789" />
                            )}
                          />
                        </Field>
                      </SimpleGrid>
                    </VStack>
                  </Fieldset.Content>
                </Fieldset.Root>
              </VStack>

              <VStack gap={6} align="stretch">
                {/* Recipient Details */}
                <Fieldset.Root>
                  <Fieldset.Legend>
                    {t("order.sendParcelForm.recipient", {
                      defaultValue: "Recipient (Order Shipping)",
                    })}
                  </Fieldset.Legend>
                  <Fieldset.Content>
                    <VStack gap={4} align="stretch">
                      {/* Recipient Delivery Point - Show when order uses parcel locker delivery */}
                      {requiresRecipientPoint && (
                        <>
                          <Card.Root colorPalette="success" variant="subtle">
                            <Card.Body>
                              <HStack gap={2} align="center">
                                <MaterialSymbol>info</MaterialSymbol>
                                <Text fontSize="sm">
                                  {t(
                                    "order.sendParcelForm.recipientPointInfo",
                                    {
                                      defaultValue:
                                        "The recipient will collect the package from a parcel locker or pickup point.",
                                    },
                                  )}
                                </Text>
                              </HStack>
                            </Card.Body>
                          </Card.Root>
                          <Field
                            label={t(
                              "order.sendParcelForm.recipientDeliveryPoint",
                              { defaultValue: "Recipient Delivery Point" },
                            )}
                            helperText={t(
                              "order.sendParcelForm.recipientPointHelper",
                              {
                                defaultValue:
                                  "Select where the package will be delivered for recipient pickup (min. 2 characters to search)",
                              },
                            )}
                            invalid={!!errors.recipientPointId}
                            errorText={errors.recipientPointId?.message}
                          >
                            <Controller
                              name="recipientPointId"
                              control={control}
                              render={({ field }) => (
                                <Combobox.Root
                                  collection={recipientPointCollection}
                                  value={field.value ? [field.value] : []}
                                  inputValue={recipientPointInputValue}
                                  onValueChange={({ value }) => {
                                    const selectedValue = value[0] ?? "";
                                    field.onChange(selectedValue);
                                    if (!selectedValue) {
                                      setSelectedRecipientPoint(null);
                                      setRecipientPointInputValue("");
                                      methods.setValue(
                                        "recipientPointName",
                                        "",
                                        {
                                          shouldDirty: false,
                                          shouldTouch: true,
                                          shouldValidate: false,
                                        },
                                      );
                                      return;
                                    }
                                    const selectedOption =
                                      recipientPointOptions.find(
                                        (opt) => opt.value === selectedValue,
                                      );
                                    if (selectedOption) {
                                      setSelectedRecipientPoint(
                                        selectedOption.point,
                                      );
                                      setRecipientPointInputValue(
                                        selectedOption.label,
                                      );
                                      methods.setValue(
                                        "recipientPointName",
                                        selectedOption.point.name ||
                                          selectedOption.point.address ||
                                          selectedOption.point.id,
                                        {
                                          shouldDirty: false,
                                          shouldTouch: false,
                                          shouldValidate: false,
                                        },
                                      );
                                    }
                                  }}
                                  onInputValueChange={({ inputValue }) => {
                                    setRecipientPointInputValue(inputValue);
                                    scheduleRecipientPointSearch(inputValue);
                                  }}
                                  disabled={!courier}
                                  openOnClick
                                  closeOnSelect
                                  selectionBehavior="replace"
                                >
                                  <Combobox.Control>
                                    <Combobox.Input
                                      placeholder={
                                        !courier
                                          ? t(
                                              "order.sendParcelForm.selectCourierFirst",
                                              {
                                                defaultValue:
                                                  "Select courier first",
                                              },
                                            )
                                          : isLoadingRecipientPoints
                                            ? t(
                                                "order.sendParcelForm.loadingPoints",
                                                {
                                                  defaultValue:
                                                    "Loading points...",
                                                },
                                              )
                                            : t(
                                                "order.sendParcelForm.searchRecipientPoint",
                                                {
                                                  defaultValue:
                                                    "Search recipient delivery point...",
                                                },
                                              )
                                      }
                                    />
                                    <Combobox.IndicatorGroup>
                                      {isLoadingRecipientPoints && (
                                        <Spinner size="xs" />
                                      )}
                                      <Combobox.ClearTrigger />
                                      <Combobox.Trigger />
                                    </Combobox.IndicatorGroup>
                                  </Combobox.Control>
                                  <Combobox.Positioner>
                                    <Combobox.Content>
                                      {isLoadingRecipientPoints ? (
                                        <Combobox.Empty>
                                          <HStack gap={2}>
                                            <Spinner size="sm" />
                                            <Text fontSize="sm">
                                              {t(
                                                "order.sendParcelForm.loadingPoints",
                                                {
                                                  defaultValue:
                                                    "Loading points...",
                                                },
                                              )}
                                            </Text>
                                          </HStack>
                                        </Combobox.Empty>
                                      ) : recipientPointOptions.length === 0 ? (
                                        <Combobox.Empty>
                                          <Text fontSize="sm" color="fg.muted">
                                            {t(
                                              "order.sendParcelForm.noPointsFound",
                                              {
                                                defaultValue: "No points found",
                                              },
                                            )}
                                          </Text>
                                        </Combobox.Empty>
                                      ) : (
                                        recipientPointOptions.map((option) => (
                                          <Combobox.Item
                                            key={option.value}
                                            item={option}
                                          >
                                            {option.label}
                                            <Combobox.ItemIndicator />
                                          </Combobox.Item>
                                        ))
                                      )}
                                    </Combobox.Content>
                                  </Combobox.Positioner>
                                </Combobox.Root>
                              )}
                            />
                          </Field>
                          {selectedRecipientPoint && (
                            <Card.Root variant="outline" borderWidth="1px">
                              <Card.Body>
                                <VStack gap={2} align="stretch">
                                  <Text fontSize="sm" color="fg.muted">
                                    {selectedRecipientPoint.address}
                                  </Text>
                                  {selectedRecipientPoint.openingHours && (
                                    <Text fontSize="sm" color="fg.muted">
                                      {t("order.sendParcelForm.openingHours", {
                                        defaultValue:
                                          "Opening hours: {{hours}}",
                                        hours:
                                          selectedRecipientPoint.openingHours,
                                      })}
                                    </Text>
                                  )}
                                  <HStack gap={2} wrap="wrap">
                                    {selectedRecipientPoint.collect && (
                                      <Badge size="sm" colorPalette="blue">
                                        {t(
                                          "order.sendParcelForm.pointCollect",
                                          {
                                            defaultValue: "Pickup",
                                          },
                                        )}
                                      </Badge>
                                    )}
                                    {selectedRecipientPoint.cod && (
                                      <Badge size="sm" colorPalette="orange">
                                        {t("order.sendParcelForm.pointCod", {
                                          defaultValue: "COD",
                                        })}
                                      </Badge>
                                    )}
                                  </HStack>
                                </VStack>
                              </Card.Body>
                            </Card.Root>
                          )}
                        </>
                      )}

                      <Field
                        label={t("order.sendParcelForm.person", {
                          defaultValue: "Name",
                        })}
                        invalid={!!errors.recipientPerson}
                        errorText={errors.recipientPerson?.message}
                      >
                        <Controller
                          name="recipientPerson"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder={t("order.sendParcelForm.name", {
                                defaultValue: "Name",
                              })}
                            />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.company", {
                          defaultValue: "Company (optional)",
                        })}
                        invalid={!!errors.recipientCompany}
                        errorText={errors.recipientCompany?.message}
                      >
                        <Controller
                          name="recipientCompany"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder={t("order.sendParcelForm.company", {
                                defaultValue: "Company name",
                              })}
                            />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.street", {
                          defaultValue: "Street",
                        })}
                        invalid={!!errors.recipientStreet}
                        errorText={errors.recipientStreet?.message}
                        helperText={t("order.sendParcelForm.streetHelper", {
                          defaultValue:
                            "Enter full address (e.g., 'Example Street 10/5' or 'Example Avenue 12 m. 3')",
                        })}
                      >
                        <Controller
                          name="recipientStreet"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder={t("order.sendParcelForm.street", {
                                defaultValue: "Street",
                              })}
                              onBlur={(e) => {
                                field.onBlur();
                                const parsed = parseStreetAddress(
                                  e.target.value,
                                );
                                const formatted = formatStreetLine(
                                  parsed.street || e.target.value.trim(),
                                  parsed.number || null,
                                  parsed.flat || null,
                                );
                                if (formatted) {
                                  methods.setValue(
                                    "recipientStreet",
                                    formatted,
                                  );
                                }
                              }}
                            />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.postcode", {
                          defaultValue: "Postcode",
                        })}
                        invalid={!!errors.recipientPostcode}
                        errorText={errors.recipientPostcode?.message}
                      >
                        <Controller
                          name="recipientPostcode"
                          control={control}
                          render={({ field }) => (
                            <Input {...field} placeholder="00-000" />
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.city", {
                          defaultValue: "City",
                        })}
                        invalid={!!errors.recipientCity}
                        errorText={errors.recipientCity?.message}
                      >
                        <Controller
                          name="recipientCity"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder={t("order.sendParcelForm.city", {
                                defaultValue: "City",
                              })}
                            />
                          )}
                        />
                      </Field>

                      <SimpleGrid columns={[1, 2]} gap={4}>
                        <Field
                          label={t("order.sendParcelForm.email", {
                            defaultValue: "Email",
                          })}
                          invalid={!!errors.recipientEmail}
                          errorText={errors.recipientEmail?.message}
                        >
                          <Controller
                            name="recipientEmail"
                            control={control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                type="email"
                                placeholder="email@example.com"
                              />
                            )}
                          />
                        </Field>

                        <Field
                          label={t("order.sendParcelForm.phone", {
                            defaultValue: "Phone",
                          })}
                          invalid={!!errors.recipientPhone}
                          errorText={errors.recipientPhone?.message}
                        >
                          <Controller
                            name="recipientPhone"
                            control={control}
                            render={({ field }) => (
                              <Input {...field} placeholder="+48 987 654 321" />
                            )}
                          />
                        </Field>
                      </SimpleGrid>
                    </VStack>
                  </Fieldset.Content>
                </Fieldset.Root>
              </VStack>
            </SimpleGrid>

            {/* Third row: remaining shipment settings */}
            <VStack gap={6} align="stretch">
              <Separator />

              {/* 4. Courier and Shipment Type */}
              <Fieldset.Root>
                <Fieldset.Legend>
                  {t("order.sendParcelForm.basicInfo", {
                    defaultValue: "Basic Information",
                  })}
                </Fieldset.Legend>
                <Fieldset.Content>
                  <VStack gap={4} align="stretch">
                    <Field
                      label={t("order.sendParcelForm.courier", {
                        defaultValue: "Courier",
                      })}
                      invalid={!!errors.courier}
                      errorText={errors.courier?.message}
                      w="full"
                      helperText={
                        isLoadingCouriers
                          ? t("order.sendParcelForm.loadingCouriers", {
                              defaultValue: "Loading available couriers...",
                            })
                          : displayedCourierSelectionOptions.length === 0
                            ? t("order.sendParcelForm.noCouriers", {
                                defaultValue:
                                  "No couriers available for the selected addresses.",
                              })
                            : undefined
                      }
                    >
                      <Controller
                        name="courier"
                        control={control}
                        render={({ field }) => (
                          <VStack align="stretch" gap={3} w="full">
                            {isLoadingPrice && (
                              <HStack gap={2}>
                                <Spinner size="sm" />
                                <Text fontSize="sm" color="fg.muted">
                                  {t(
                                    "order.sendParcelForm.calculatingCourierPrices",
                                    {
                                      defaultValue:
                                        "Calculating courier prices...",
                                    },
                                  )}
                                </Text>
                              </HStack>
                            )}

                            <SimpleGrid
                              columns={{ base: 1, sm: 2, lg: 3, xl: 4 }}
                              gap={3}
                              w="full"
                            >
                              {displayedCourierSelectionOptions.map(
                                (option) => {
                                  const isSelected =
                                    field.value === option.value;
                                  const routeLabel = formatCourierRouteLabel(
                                    option.route,
                                  );
                                  const routeColorPalette =
                                    option.route.from === "point" ||
                                    option.route.to === "point"
                                      ? "purple"
                                      : "blue";

                                  return (
                                    <Button
                                      key={option.value}
                                      type="button"
                                      variant={
                                        isSelected ? "surface" : "outline"
                                      }
                                      colorPalette={
                                        isSelected ? "primary" : "gray"
                                      }
                                      onClick={() =>
                                        field.onChange(option.value)
                                      }
                                      disabled={isLoadingCouriers}
                                      h="auto"
                                      py={3}
                                      px={3}
                                      justifyContent="flex-start"
                                      textAlign="left"
                                      borderRadius="lg"
                                      w="full"
                                    >
                                      <VStack align="stretch" gap={2} w="full">
                                        <HStack
                                          justify="space-between"
                                          align="start"
                                          w="full"
                                        >
                                          <Text
                                            fontWeight="semibold"
                                            fontSize="sm"
                                            lineClamp={2}
                                            minW={0}
                                          >
                                            {option.label}
                                          </Text>
                                          {isSelected && (
                                            <Badge
                                              colorPalette="primary"
                                              size="sm"
                                              flexShrink={0}
                                            >
                                              {t("common.selected", {
                                                defaultValue: "Selected",
                                              })}
                                            </Badge>
                                          )}
                                        </HStack>

                                        <Badge
                                          colorPalette={routeColorPalette}
                                          size="sm"
                                          alignSelf="flex-start"
                                          variant="subtle"
                                        >
                                          {routeLabel}
                                        </Badge>

                                        {option.serviceLabel ? (
                                          <Text
                                            fontSize="xs"
                                            color="fg.muted"
                                            lineClamp={1}
                                          >
                                            {option.serviceLabel}
                                          </Text>
                                        ) : null}

                                        {option.estimate ? (
                                          <VStack align="stretch" gap={0.5}>
                                            <Text
                                              fontWeight="medium"
                                              fontSize="md"
                                            >
                                              {option.estimate.grossprice.toFixed(
                                                2,
                                              )}{" "}
                                              PLN
                                            </Text>
                                            <Text
                                              fontSize="xs"
                                              color="fg.muted"
                                              lineHeight="shorter"
                                            >
                                              {t(
                                                "order.sendParcelForm.netPrice",
                                                {
                                                  defaultValue: "Net:",
                                                },
                                              )}{" "}
                                              {option.estimate.netprice.toFixed(
                                                2,
                                              )}{" "}
                                              PLN
                                            </Text>
                                          </VStack>
                                        ) : (
                                          <Text
                                            fontSize="xs"
                                            color="fg.muted"
                                            lineHeight="shorter"
                                          >
                                            {t(
                                              "order.sendParcelForm.noEstimateYet",
                                              {
                                                defaultValue:
                                                  "No estimate available yet",
                                              },
                                            )}
                                          </Text>
                                        )}
                                      </VStack>
                                    </Button>
                                  );
                                },
                              )}
                            </SimpleGrid>
                          </VStack>
                        )}
                      />
                    </Field>

                    <Field
                      label={t("order.sendParcelForm.shipmentType", {
                        defaultValue: "Shipment Type",
                      })}
                      invalid={!!errors.shipmentType}
                      errorText={errors.shipmentType?.message}
                    >
                      <Controller
                        name="shipmentType"
                        control={control}
                        render={({ field }) => (
                          <Select.Root
                            collection={createListCollection({
                              items: shipmentTypeOptions,
                            })}
                            value={
                              typeof field.value === "string" &&
                              field.value.length > 0
                                ? [field.value]
                                : []
                            }
                            onValueChange={(e) =>
                              field.onChange(e.value[0] ?? "")
                            }
                          >
                            <Select.Trigger>
                              <Select.ValueText
                                placeholder={t(
                                  "order.sendParcelForm.selectType",
                                  { defaultValue: "Select type" },
                                )}
                              />
                            </Select.Trigger>
                            <Select.Positioner>
                              <Select.Content>
                                <For each={shipmentTypeOptions}>
                                  {(item) => (
                                    <Select.Item key={item.value} item={item}>
                                      {item.label}
                                    </Select.Item>
                                  )}
                                </For>
                              </Select.Content>
                            </Select.Positioner>
                          </Select.Root>
                        )}
                      />
                    </Field>

                    <Field
                      label={t("order.sendParcelForm.description", {
                        defaultValue: "Description (max 30 chars)",
                      })}
                      invalid={!!errors.description}
                      errorText={errors.description?.message}
                    >
                      <Controller
                        name="description"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder={t(
                              "order.sendParcelForm.packageDescription",
                              { defaultValue: "Package description" },
                            )}
                            maxLength={30}
                          />
                        )}
                      />
                    </Field>
                  </VStack>
                </Fieldset.Content>
              </Fieldset.Root>

              {/* 5. Pickup Details */}
              <Fieldset.Root>
                <Fieldset.Content>
                  <Field
                    label={t("order.sendParcelForm.deliveryMethod", {
                      defaultValue: "Delivery Method",
                    })}
                    helperText={t("order.sendParcelForm.deliveryMethodHelper", {
                      defaultValue:
                        "Choose whether courier should pick up the package or you will deliver it yourself to a pickup point",
                    })}
                  >
                    <Controller
                      name="deliveryMethod"
                      control={control}
                      render={({ field }) => (
                        <Select.Root
                          collection={createListCollection({
                            items: [
                              {
                                value: "courier_pickup",
                                label: t("order.sendParcelForm.courierPickup", {
                                  defaultValue: "Courier Pickup",
                                }),
                              },
                              {
                                value: "self_delivery",
                                label: t("order.sendParcelForm.selfDelivery", {
                                  defaultValue: "Self Delivery to Point",
                                }),
                              },
                            ],
                          })}
                          value={
                            typeof field.value === "string" &&
                            field.value.length > 0
                              ? [field.value]
                              : []
                          }
                          onValueChange={(e) =>
                            field.onChange(e.value[0] ?? "")
                          }
                        >
                          <Select.Trigger>
                            <Select.ValueText
                              placeholder={t(
                                "order.sendParcelForm.selectDeliveryMethod",
                                { defaultValue: "Select delivery method" },
                              )}
                            />
                          </Select.Trigger>
                          <Select.Positioner>
                            <Select.Content>
                              <Select.Item
                                item={{
                                  value: "courier_pickup",
                                  label: t(
                                    "order.sendParcelForm.courierPickup",
                                    {
                                      defaultValue: "Courier Pickup",
                                    },
                                  ),
                                }}
                              >
                                {t("order.sendParcelForm.courierPickup", {
                                  defaultValue: "Courier Pickup",
                                })}
                              </Select.Item>
                              <Select.Item
                                item={{
                                  value: "self_delivery",
                                  label: t(
                                    "order.sendParcelForm.selfDelivery",
                                    {
                                      defaultValue: "Self Delivery to Point",
                                    },
                                  ),
                                }}
                              >
                                {t("order.sendParcelForm.selfDelivery", {
                                  defaultValue: "Self Delivery to Point",
                                })}
                              </Select.Item>
                            </Select.Content>
                          </Select.Positioner>
                        </Select.Root>
                      )}
                    />
                  </Field>

                  {deliveryMethod === "courier_pickup" && (
                    <SimpleGrid columns={[1, 3]} gap={4} mt={4}>
                      <Field
                        label={t("order.sendParcelForm.pickupDate", {
                          defaultValue: "Pickup Date",
                        })}
                        invalid={!!errors.pickupDate}
                        errorText={errors.pickupDate?.message}
                        helperText={
                          isLoadingPickupTimes
                            ? t("order.sendParcelForm.loadingDates", {
                                defaultValue: "Loading available dates...",
                              })
                            : undefined
                        }
                      >
                        <Controller
                          name="pickupDate"
                          control={control}
                          render={({ field }) => (
                            <Select.Root
                              collection={createListCollection({
                                items: pickupDateOptions,
                              })}
                              value={
                                typeof field.value === "string" &&
                                field.value.length > 0
                                  ? [field.value]
                                  : []
                              }
                              onValueChange={(e) => {
                                const selectedDate = e.value[0] ?? "";
                                field.onChange(selectedDate);
                                if (!selectedDate) {
                                  return;
                                }
                                // Auto-set first time slot for selected date
                                const slotsForDate =
                                  timeSlots[selectedDate] || [];
                                if (slotsForDate.length > 0) {
                                  const firstSlot = slotsForDate[0];
                                  methods.setValue(
                                    "pickupTimeFrom",
                                    firstSlot.timefrom,
                                  );
                                  methods.setValue(
                                    "pickupTimeTo",
                                    firstSlot.timeto,
                                  );
                                }
                              }}
                              disabled={
                                isLoadingPickupTimes ||
                                availableDates.length === 0
                              }
                            >
                              <Select.Trigger>
                                <Select.ValueText
                                  placeholder={
                                    isLoadingPickupTimes
                                      ? t("common.loading", {
                                          defaultValue: "Loading...",
                                        })
                                      : t("order.sendParcelForm.selectDate", {
                                          defaultValue: "Select date",
                                        })
                                  }
                                />
                              </Select.Trigger>
                              <Select.Positioner>
                                <Select.Content>
                                  <For each={pickupDateOptions}>
                                    {(item) => (
                                      <Select.Item key={item.value} item={item}>
                                        {item.label}
                                      </Select.Item>
                                    )}
                                  </For>
                                </Select.Content>
                              </Select.Positioner>
                            </Select.Root>
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.pickupTimeFrom", {
                          defaultValue: "From Time",
                        })}
                        invalid={!!errors.pickupTimeFrom}
                        errorText={errors.pickupTimeFrom?.message}
                        helperText={
                          !selectedPickupDate
                            ? t("order.sendParcelForm.selectDateFirst", {
                                defaultValue: "Select a date first",
                              })
                            : undefined
                        }
                      >
                        <Controller
                          name="pickupTimeFrom"
                          control={control}
                          render={({ field }) => (
                            <Select.Root
                              collection={createListCollection({
                                items: currentTimeOptions,
                              })}
                              value={
                                typeof field.value === "string" &&
                                field.value.length > 0
                                  ? [field.value]
                                  : []
                              }
                              onValueChange={(e) => {
                                const nextValue = e.value[0] ?? "";
                                field.onChange(nextValue);
                                if (!nextValue) {
                                  methods.setValue("pickupTimeTo", "");
                                  return;
                                }
                                // Auto-set timeto based on selected slot
                                const selectedOption = currentTimeOptions.find(
                                  (opt) => opt.value === nextValue,
                                );
                                if (selectedOption) {
                                  methods.setValue(
                                    "pickupTimeTo",
                                    selectedOption.timeto,
                                  );
                                }
                              }}
                              disabled={
                                !selectedPickupDate ||
                                currentTimeOptions.length === 0
                              }
                            >
                              <Select.Trigger>
                                <Select.ValueText
                                  placeholder={t(
                                    "order.sendParcelForm.selectTime",
                                    { defaultValue: "Select time" },
                                  )}
                                />
                              </Select.Trigger>
                              <Select.Positioner>
                                <Select.Content>
                                  <For each={currentTimeOptions}>
                                    {(item) => (
                                      <Select.Item key={item.value} item={item}>
                                        {item.label}
                                      </Select.Item>
                                    )}
                                  </For>
                                </Select.Content>
                              </Select.Positioner>
                            </Select.Root>
                          )}
                        />
                      </Field>

                      <Field
                        label={t("order.sendParcelForm.pickupTimeTo", {
                          defaultValue: "To Time",
                        })}
                        invalid={!!errors.pickupTimeTo}
                        errorText={errors.pickupTimeTo?.message}
                      >
                        <Controller
                          name="pickupTimeTo"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              readOnly
                              placeholder={t(
                                "order.sendParcelForm.autoFilled",
                                {
                                  defaultValue: "Auto-filled",
                                },
                              )}
                              disabled
                            />
                          )}
                        />
                      </Field>
                    </SimpleGrid>
                  )}
                </Fieldset.Content>
              </Fieldset.Root>

              {/* 3. Optional: COD and Insurance */}
              <Fieldset.Root>
                <Fieldset.Legend>
                  {t("order.sendParcelForm.additionalOptions", {
                    defaultValue: "Additional Options",
                  })}
                </Fieldset.Legend>
                <Fieldset.Content>
                  <SimpleGrid columns={[1, 2]} gap={4}>
                    <Field
                      label={t("order.sendParcelForm.codAmount", {
                        defaultValue: "COD Amount (0 for none)",
                      })}
                      invalid={!!errors.codAmount}
                      errorText={errors.codAmount?.message}
                      helperText={
                        !isCodAllowed
                          ? t(
                              "order.sendParcelForm.codUnavailableForPointRoute",
                              {
                                defaultValue:
                                  "COD is unavailable for point-based delivery routes.",
                              },
                            )
                          : order?.paymentType === PaymentType.ON_DELIVERY
                            ? t("order.sendParcelForm.codForOnDelivery", {
                                defaultValue:
                                  "COD required for ON_DELIVERY payment type",
                              })
                            : t("order.sendParcelForm.codOptional", {
                                defaultValue: "Set to 0 if not using COD",
                              })
                      }
                    >
                      <Controller
                        name="codAmount"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            step={0.01}
                            disabled={!isCodAllowed}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        )}
                      />
                    </Field>

                    <Field
                      label={t("order.sendParcelForm.insurance", {
                        defaultValue: "Insurance Amount",
                      })}
                      invalid={!!errors.insurance}
                      errorText={errors.insurance?.message}
                    >
                      <Controller
                        name="insurance"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            step={0.01}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        )}
                      />
                    </Field>
                  </SimpleGrid>

                  {isCodAllowed && codAmount > 0 && (
                    <Field
                      label={t("order.sendParcelForm.codBankAccount", {
                        defaultValue: "COD Bank Account",
                      })}
                      invalid={!!errors.codBankAccount}
                      errorText={errors.codBankAccount?.message}
                      mt={4}
                      helperText={t(
                        "order.sendParcelForm.codBankAccountHelper",
                        {
                          defaultValue:
                            "Required when COD amount is greater than 0",
                        },
                      )}
                    >
                      <Controller
                        name="codBankAccount"
                        control={control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            placeholder={t(
                              "order.sendParcelForm.codBankAccount",
                              { defaultValue: "Bank account number" },
                            )}
                          />
                        )}
                      />
                    </Field>
                  )}
                </Fieldset.Content>
              </Fieldset.Root>
            </VStack>
          </VStack>

          {/* Price Estimate Card */}
          {!createdOrderNumber && (
            <Card.Root
              colorPalette={selectedPriceEstimate ? "blue" : "gray"}
              variant="subtle"
            >
              <Card.Body>
                <HStack justify="space-between" align="center" gap={4}>
                  <VStack gap={1} align="flex-start" flex="1">
                    <Text fontSize="sm" color="fg.muted">
                      {t("order.sendParcelForm.estimatedPrice", {
                        defaultValue: "Estimated Price",
                      })}
                    </Text>
                    {selectedPriceEstimate ? (
                      <>
                        <Text fontSize="2xl" fontWeight="bold">
                          {selectedPriceEstimate.grossprice.toFixed(2)} PLN
                        </Text>
                        <Text fontSize="xs" color="fg.muted">
                          {t("order.sendParcelForm.netPrice", {
                            defaultValue: "Net:",
                          })}{" "}
                          {selectedPriceEstimate.netprice.toFixed(2)} PLN
                        </Text>
                      </>
                    ) : (
                      <Text fontSize="md" color="fg.muted">
                        {isLoadingPrice
                          ? t("order.sendParcelForm.calculatingPrice", {
                              defaultValue: "Calculating price...",
                            })
                          : t("order.sendParcelForm.fillFormForPrice", {
                              defaultValue:
                                "Select courier, packages, and addresses to see price estimate",
                            })}
                      </Text>
                    )}
                  </VStack>
                  {canEstimatePrices && (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={() => refreshPriceEstimate()}
                      disabled={isLoadingPrice}
                      aria-label={t("order.sendParcelForm.refreshPrice", {
                        defaultValue: "Refresh price estimate",
                      })}
                    >
                      <MaterialSymbol
                        className={isLoadingPrice ? "animate-spin" : ""}
                      >
                        refresh
                      </MaterialSymbol>
                    </IconButton>
                  )}
                </HStack>
              </Card.Body>
            </Card.Root>
          )}

          {/* Submit Button */}
          <HStack
            flexDirection={["column", "row"]}
            justify="flex-end"
            gap={4}
            align="stretch"
          >
            {showCancelButton && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel || (() => router.back())}
                disabled={isSubmitting}
              >
                <MaterialSymbol>arrow_back</MaterialSymbol>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
            )}
            <Button type="submit" colorPalette="primary" loading={isSubmitting}>
              <MaterialSymbol>local_shipping</MaterialSymbol>
              {t("order.sendParcelForm.submit", {
                defaultValue: "Create Parcel Order",
              })}
            </Button>
          </HStack>
        </VStack>
      </Container>
    </form>
  );
}
