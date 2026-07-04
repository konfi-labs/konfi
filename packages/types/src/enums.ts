type StringEnum = Record<string, string>;

export function enumToSearchOptions(
  typeEnum: StringEnum,
  eq?: (key: string) => boolean,
) {
  return Object.entries(typeEnum)
    .filter(([key]) => (eq ? eq(key) : true))
    .map(([key, value]) => ({ label: value, value: key }));
}

export enum PriceTypeEnum {
  SINGLE = "SINGLE",
  THRESHOLD = "THRESHOLD",
  MATRIX = "MATRIX",
  DYNAMIC = "DYNAMIC",
}

export const PriceTypeAsOptions = enumToSearchOptions(PriceTypeEnum);

export enum AddressTypeEnum {
  BILLING = "BILLING",
  SHIPPING = "SHIPPING",
}

export enum DiscountTypeEnum {
  FIXED = "FIXED",
  PERCENTAGE = "PERCENTAGE",
}

export const DiscountTypeAsOptions = enumToSearchOptions(DiscountTypeEnum);

export enum OrderStatus {
  NEW = "NEW",
  UNDER_REVIEW = "UNDER_REVIEW",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_FOR_MATERIALS = "WAITING_FOR_MATERIALS",
  DELAYED = "DELAYED",
  READY = "READY",
  FULFILLED = "FULFILLED",
  CANCELED = "CANCELED",
  DRAFT = "DRAFT",
}

export const isOrderStatus = (
  test: unknown,
): test is keyof typeof OrderStatus => {
  return (
    test === OrderStatus.NEW ||
    test === OrderStatus.UNDER_REVIEW ||
    test === OrderStatus.IN_PROGRESS ||
    test === OrderStatus.WAITING_FOR_MATERIALS ||
    test === OrderStatus.DELAYED ||
    test === OrderStatus.READY ||
    test === OrderStatus.FULFILLED ||
    test === OrderStatus.CANCELED ||
    test === OrderStatus.DRAFT
  );
};

export const OrderStatusAsOptions = enumToSearchOptions(OrderStatus);

export enum OrderFilesStatus {
  WAITING_FOR_FILES = "WAITING_FOR_FILES",
  WAITING_FOR_FILES_APPROVAL = "WAITING_FOR_FILES_APPROVAL",
  UNDER_DESIGN = "UNDER_DESIGN",
  FILES_ARE_READY = "FILES_ARE_READY",
  FOR_VERIFICATION = "FOR_VERIFICATION",
  FOR_PREPARATION = "FOR_PREPARATION",
}

export const isOrderFilesStatus = (
  test: unknown,
): test is keyof typeof OrderFilesStatus => {
  return (
    test === OrderFilesStatus.WAITING_FOR_FILES ||
    test === OrderFilesStatus.WAITING_FOR_FILES_APPROVAL ||
    test === OrderFilesStatus.UNDER_DESIGN ||
    test === OrderFilesStatus.FILES_ARE_READY ||
    test === OrderFilesStatus.FOR_VERIFICATION ||
    test === OrderFilesStatus.FOR_PREPARATION
  );
};

export const OrderFilesStatusAsOptions = enumToSearchOptions(OrderFilesStatus);

export enum PaymentType {
  ON_PICKUP = "ON_PICKUP",
  ON_DELIVERY = "ON_DELIVERY",
  PROFORMA = "PROFORMA",
  BANK_TRANSFER = "BANK_TRANSFER",
  DEFERRED = "DEFERRED",
  STRIPE = "STRIPE",
  PRZELEWY24 = "PRZELEWY24",
  ALLEGRO = "ALLEGRO",
}

export const PaymentTypesAsOptions = enumToSearchOptions(PaymentType);

export enum PaymentStatus {
  NEW = "NEW",
  PENDING = "PENDING",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  COMPLETED = "COMPLETED",
  REFUNDED = "REFUNDED",
  CANCELED = "CANCELED",
  DRAFT = "DRAFT",
}

export const isPaymentStatus = (
  test: unknown,
): test is keyof typeof PaymentStatus => {
  return (
    test === PaymentStatus.NEW ||
    test === PaymentStatus.PENDING ||
    test === PaymentStatus.PARTIALLY_PAID ||
    test === PaymentStatus.COMPLETED ||
    test === PaymentStatus.REFUNDED ||
    test === PaymentStatus.CANCELED ||
    test === PaymentStatus.DRAFT
  );
};

export const PaymentStatusAsOptions = enumToSearchOptions(PaymentStatus);

export type CurrencyCode = string;

export enum CurrencyEnum {
  PLN = "PLN",
}

export const CurrencyEnumAsOptions = enumToSearchOptions(CurrencyEnum);

export enum Unit {
  PCS = "PCS",
  M2 = "M2",
  MB = "MB",
  HOUR = "HOUR",
  SHEET = "SHEET",
  KM = "KM",
  CMB = "CMB",
  CM2 = "CM2",
}

export enum UnitReadable {
  PCS = "szt.",
  M2 = "m2",
  MB = "mb",
  HOUR = "godz.",
  SHEET = "ark.",
  KM = "km",
  CMB = "cmb",
  CM2 = "cm2",
}

export const UnitAsOptions = enumToSearchOptions(Unit);

export enum ActivityStatus {
  ORDER_STATUS_UPDATE = "ORDER_STATUS_UPDATE",
  PAYMENT_STATUS_UPDATE = "PAYMENT_STATUS_UPDATE",
  FILES_STATUS_UPDATE = "FILES_STATUS_UPDATE",
  EMAIL_SENT = "EMAIL_SENT",
  TRACKING_SCAN = "TRACKING_SCAN",
  PAYMENT_METHOD_CHANGED = "PAYMENT_METHOD_CHANGED",
  ORDER_PRINTED = "ORDER_PRINTED",
  INTERNAL_TRANSIT_SCHEDULED = "INTERNAL_TRANSIT_SCHEDULED",
  INTERNAL_TRANSIT_ARRIVED = "INTERNAL_TRANSIT_ARRIVED",
  INTERNAL_TRANSIT_CANCELED = "INTERNAL_TRANSIT_CANCELED",
}

export enum FormTypes {
  CREATE = "Utwórz",
  UPDATE = "Edytuj",
  DUPLICATE = "Kopiuj",
  CONVERT = "Konwertuj",
}

export enum ShippingTypes {
  CUSTOM = "CUSTOM",
  PERSONAL_COLLECTION = "PERSONAL_COLLECTION",
  COURIER = "COURIER",
  PARCEL_DELIVERY_LOCKER = "PARCEL_DELIVERY_LOCKER",
}

export const ShippingTypesAsOptions = enumToSearchOptions(ShippingTypes);

export enum ShippingOptions {
  CUSTOM = "CUSTOM",
  COMPANY_COURIER = "COMPANY_COURIER",
  PERSONAL_COLLECTION = "PERSONAL_COLLECTION",
  INPOST = "INPOST",
  PACZKOMATY_INPOST = "PACZKOMATY_INPOST",
  DHL = "DHL",
  DPD = "DPD",
  FEDEX = "FEDEX",
}

function enumToArray(enumType: StringEnum) {
  return Object.keys(enumType).map((key) => enumType[key]);
}

export const ShippingOptionsAsArray = enumToArray(ShippingOptions);

export const ShippingOptionsAsOptions = enumToSearchOptions(ShippingOptions);
export const ShippingOptionsAsOptionsOnlyCouriers = enumToSearchOptions(
  ShippingOptions,
).filter(
  (option) =>
    option.value !== ShippingOptions.CUSTOM &&
    option.value !== ShippingOptions.COMPANY_COURIER &&
    option.value !== ShippingOptions.PERSONAL_COLLECTION,
);

export enum ProofingOptions {
  RUN_AS_IS = "RUN_AS_IS",
  MANUAL = "MANUAL",
}

export const ProofingOptionsAsSearchOptions =
  enumToSearchOptions(ProofingOptions);

export enum ThreeDModels {
  ASTAND = "ASTAND",
  BOX = "BOX",
  BOOKLET = "BOOKLET",
  CANVAS = "CANVAS",
  CUP = "CUP",
  FLAT = "FLAT",
  FLYERS = "FLYERS",
  LBANNER = "LBANNER",
  PIN = "PIN",
  ROLLUP_PREMIUM = "ROLLUP_PREMIUM",
  ROLLUP_STANDARD = "ROLLUP_STANDARD",
  TOOTHPICK = "TOOTHPICK",
  XBANNER = "XBANNER",
}

export const ThreeDModelsAsOptions = enumToSearchOptions(ThreeDModels);

export enum PromotionTypeEnum {
  STANDARD = "STANDARD",
  // BUYGET = "BUYGET",
}

export const PromotionTypesAsOptions = enumToSearchOptions(PromotionTypeEnum);

export enum RuleTypeEnum {
  RULES = "RULES",
  BUY_RULES = "BUY_RULES",
  TARGET_RULES = "TARGET_RULES",
}

export enum PromotionRuleOperatorEnum {
  GT = "GT",
  LT = "LT",
  EQ = "EQ",
  NE = "NE",
  IN = "IN",
  LTE = "LTE",
  GTE = "GTE",
}

export const PromotionRuleOperatorsAsOptions = enumToSearchOptions(
  PromotionRuleOperatorEnum,
);

export enum ApplicationMethodTypeEnum {
  FIXED = "FIXED",
  PERCENTAGE = "PERCENTAGE",
}

export const ApplicationMethodTypesAsOptions = enumToSearchOptions(
  ApplicationMethodTypeEnum,
);

export enum ApplicationMethodTargetTypeEnum {
  ORDER = "ORDER",
  SHIPPING_METHODS = "SHIPPING_METHODS",
  ITEMS = "ITEMS",
}

export const ApplicationMethodTargetTypesAsOptions = enumToSearchOptions(
  ApplicationMethodTargetTypeEnum,
);

export enum ApplicationMethodAllocationEnum {
  EACH = "EACH",
  ACROSS = "ACROSS",
}

export const ApplicationMethodAllocationAsOptions = enumToSearchOptions(
  ApplicationMethodAllocationEnum,
);

export enum PromotionRuleAttributeEnum {
  PRODUCT = "PRODUCT",
  PRODUCT_TYPE = "PRODUCT_TYPE",
  CATEGORY = "CATEGORY",
  CHANNEL = "CHANNEL",
  CURRENCY = "CURRENCY",
  USER = "USER",
  CUSTOMER_GROUP = "CUSTOMER_GROUP",
  FIRST_ORDER = "FIRST_ORDER",
  USAGE_COUNT = "USAGE_COUNT",
}

export const PromotionRuleAttributesAsOptions = enumToSearchOptions(
  PromotionRuleAttributeEnum,
);

export enum CampaignBudgetTypeEnum {
  SPEND = "SPEND",
  USAGE = "USAGE",
}

export const CampaignBudgetTypesAsOptions = enumToSearchOptions(
  CampaignBudgetTypeEnum,
);

export enum CampaignAvailabilityTypeEnum {
  ONLINE = "ONLINE",
  POS = "POS",
}

export const CampaignAvailabilityTypesAsOptions = enumToSearchOptions(
  CampaignAvailabilityTypeEnum,
);

// paper sizes are unified in @konfi/utils (paper-sizes.ts). Use that source for options and dimensions.

export enum paperOrientation {
  PORTRAIT = "PORTRAIT",
  LANDSCAPE = "LANDSCAPE",
}

export const paperOrientationAsOptions = enumToSearchOptions(paperOrientation);

export enum bleedType {
  NO_BLEED = "NO_BLEED",
  BLEED_INCLUDED = "BLEED_INCLUDED",
  ONE_POINT_FIVE_MM_SCALE = "ONE_POINT_FIVE_MM_SCALE",
  TWO_MM_MIRROR = "TWO_MM_MIRROR",
  DIFFERENTIAL_DIFFUSION = "DIFFERENTIAL_DIFFUSION",
  CONTENT_AWARE_FAST = "CONTENT_AWARE_FAST",
}

export const bleedTypeAsOptions = enumToSearchOptions(bleedType);

export enum sourceSizing {
  PRESERVE_ORIGINAL_SIZE = "PRESERVE_ORIGINAL_SIZE",
  FIT_OUTPUT_BOX = "FIT_OUTPUT_BOX",
}

export const sourceSizingAsOptions = enumToSearchOptions(sourceSizing);

export enum bindingEdge {
  LEFT = "LEFT",
  RIGHT = "RIGHT",
  TOP = "TOP",
  BOTTOM = "BOTTOM",
}

export const bindingEdgeAsOptions = enumToSearchOptions(bindingEdge);

export enum duplexMode {
  SIMPLEX = "SIMPLEX",
  DUPLEX_LONG_EDGE = "DUPLEX_LONG_EDGE",
  DUPLEX_SHORT_EDGE = "DUPLEX_SHORT_EDGE",
}

export const duplexModeAsOptions = enumToSearchOptions(duplexMode);

export enum backPageRotation {
  ROTATION_0 = "ROTATION_0",
  ROTATION_90 = "ROTATION_90",
  ROTATION_180 = "ROTATION_180",
  ROTATION_270 = "ROTATION_270",
}

export const backPageRotationAsOptions = enumToSearchOptions(backPageRotation);

export enum layoutType {
  STEP_AND_REPEAT = "STEP_AND_REPEAT",
  BOOKLET = "BOOKLET",
  N_UP = "N_UP",
  CUT_STACK = "CUT_STACK",
  SHUFFLE = "SHUFFLE",
  DUTCH_CUT = "DUTCH_CUT",
}

export const layoutTypeAsOptions = enumToSearchOptions(layoutType);

export enum PrintingMethod {
  DIGITAL = "DIGITAL",
  OFFSET = "OFFSET",
  LARGE_FORMAT = "LARGE_FORMAT",
  ECO_SOLVENT = "ECO_SOLVENT",
  UV = "UV",
  LASER = "LASER",
  DTF = "DTF",
  CUTTING = "CUTTING",
  INSTALLATION = "INSTALLATION",
}

export enum PrintingMethodColor {
  DIGITAL = "cyan",
  OFFSET = "gray",
  LARGE_FORMAT = "purple",
  ECO_SOLVENT = "green",
  UV = "blue",
  LASER = "yellow",
  DTF = "orange",
  CUTTING = "red",
  INSTALLATION = "teal",
}

export const printingMethodAsOptions = enumToSearchOptions(PrintingMethod);

export enum SearchType {
  ORDERS = "ORDERS",
  QUOTES = "QUOTES",
  CUSTOMERS = "CUSTOMERS",
  PRODUCTS = "PRODUCTS",
}

export enum Locale {
  "pl" = "pl",
  "en" = "en",
  "uk" = "uk",
  "de" = "de",
  "cs" = "cs",
  "sk" = "sk",
  "fr" = "fr",
}

export const DEFAULT_LOCALE = Locale.pl;

export const LocaleAsOptions = enumToSearchOptions(Locale).filter(
  (option) => option.value !== DEFAULT_LOCALE,
);

export enum BlogPostStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  SCHEDULED = "SCHEDULED",
}

export const BlogPostStatusAsOptions = enumToSearchOptions(BlogPostStatus);
