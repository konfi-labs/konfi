import {
  AnonymousPackageLabelAddress,
  Address,
  AddressTypeEnum,
  type InvoiceRecipientRole,
  ApplicationMethodAllocationValues,
  ApplicationMethodTargetTypeValues,
  ApplicationMethodTypeValues,
  AttributeCreateForm,
  AttributeInputTypeEnum,
  AttributeTranslationCreateForm,
  AttributeTranslationUpdateForm,
  AttributeUpdateForm,
  backPageRotation,
  bindingEdge,
  bleedType,
  BlogCategoryTranslationCreateForm,
  BlogCategoryTranslationUpdateForm,
  BlogPostStatus,
  BlogPostTranslationCreateForm,
  BlogPostTranslationUpdateForm,
  BlogTagTranslationCreateForm,
  BlogTagTranslationUpdateForm,
  CalculateStockFromSheet,
  CampaignAvailabilityTypeEnum,
  CampaignBudgetTypeValues,
  CategoryCreateForm,
  CategoryTranslationCreateForm,
  CategoryTranslationUpdateForm,
  CategoryUpdateForm,
  ChannelCreateForm,
  ChannelNotificationSettings,
  ChannelUpdateForm,
  Combination,
  ComplaintCreateForm,
  ComplaintStatus,
  ComplaintUpdateForm,
  Contact,
  CreateApplicationMethod,
  CreateB2BInquiry,
  CreateCampaign,
  CreateCampaignBudget,
  CreatePromotion,
  CreatePromotionRule,
  CurrencyEnum,
  CustomerGroupCreateForm,
  CustomerGroupUpdateForm,
  CustomerCreateForm,
  CustomerUpdateForm,
  dbMetadataUpdate,
  dbPageContentUpdate,
  DesignatedPickupAreaCreateForm,
  DesignatedPickupAreaUpdateForm,
  Discount,
  DiscountTypeEnum,
  duplexMode,
  ExternalOrderSource,
  Hero,
  HeroCard,
  HeroCardTranslation,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
  IMPOSITION_SUPPORTED_FILE_TYPES,
  HeroTranslationCreateForm,
  HeroTranslationUpdateForm,
  Impose,
  invoiceRecipientRoles,
  layoutType,
  Locale,
  MemberCreateForm,
  MemberNotificationSettings,
  MemberUpdateForm,
  Message,
  NestedCategory,
  NestedCustomer,
  NestedMember,
  NestedProduct,
  NestedProductType,
  NoteCategory,
  NoteCreateForm,
  NoteEntityType,
  NotePriority,
  NoteUpdateForm,
  NotificationType,
  Option,
  OptionTranslation,
  AdvancedEdgeSide,
  OrderCreateForm,
  OrderFilesStatus,
  OrderItem,
  type OrderItemFulfillmentAssignment,
  OrderStatus,
  OrderUpdateForm,
  OrderUpdateFormStore,
  paperOrientation,
  PaymentStatus,
  PaymentType,
  Price,
  PriceTypeEnum,
  type PrintingMethodId,
  Product,
  ProductCreateForm,
  ProductPriceOffsetConfig,
  ProductPriceOffsetRuleScope,
  ProductTranslationCreateForm,
  ProductTranslationUpdateForm,
  ProductTypeCreateForm,
  ProductTypeUpdateForm,
  ProductUpdateForm,
  PromotionRuleAttributeValues,
  PromotionRuleOperatorValues,
  PromotionTypeValues,
  ProofingOptions,
  QuoteCreateForm,
  QuoteUpdateForm,
  ShippingOptions,
  ShippingTypes,
  storeCheckoutStockPolicies,
  StoreMetadataTranslationUpdateForm,
  type StoreCheckoutStockPolicy,
  StoreOrderForm,
  StorePageContentTranslationUpdate,
  StoreSettingsForm,
  sourceSizing,
  SupplierAttributeOption,
  SupplierCreateForm,
  SupplierUpdateForm,
  ThreeDModels,
  Tracking,
  Unit,
  UpdateApplicationMethod,
  UpdateCampaign,
  UpdatePromotion,
  TranslationMeta,
  Volume,
  WarehouseCreateForm,
  WarehouseUpdateForm,
  type FakturowniaCostUnit,
} from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { isUndefined } from "es-toolkit";
import {
  array,
  boolean,
  lazy,
  mixed,
  number,
  object,
  ObjectSchema,
  ref,
  setLocale,
  string,
} from "yup";
import { DEFAULT_COMBINATION } from "./constants";
import { isEmptyOrderItem } from "./forms";
import {
  T_ACCOUNT_SETTINGS,
  T_AUTH_FORGOT,
  T_AUTH_LOGIN,
  T_AUTH_REGISTER,
  T_STORE_ABOUT_US,
  T_STORE_ACCOUNT,
  T_STORE_ACCOUNT_ADDRESSES,
  T_STORE_ACCOUNT_ORDERS,
  T_STORE_ACCOUNT_RATINGS,
  T_STORE_B2B,
  T_STORE_B2B_PRODUCTS,
  T_STORE_CART,
  T_STORE_CHECKOUT,
  T_STORE_CONTACT,
  T_STORE_COOPERATION,
  T_STORE_FAQ,
  T_STORE_GENERAL_CONDITIONS_OF_SALE,
  T_STORE_HELP,
  T_STORE_HOME,
  T_STORE_MAIN_LAYOUT,
  T_STORE_PRIVACY_POLICY,
  T_STORE_PRODUCTS,
  T_STORE_REASONS_FOR_REJECTIONS,
  T_STORE_REGULATIONS,
} from "./routes";
import { hasShippingDestination } from "./validators";

setLocale({
  mixed: {
    default: "Nieprawidłowe dane.",
    required: "Pole jest wymagane.",
  },
  number: {
    min: "Minimalna wartość to ${min}.",
    max: "Maksymalna wartość to ${max}.",
  },
  string: {
    max: "Maksymalnie ${max} znaków.",
    min: "Minimalnie ${min} znaków.",
    email: "Podany adres email jest nieprawidłowy.",
    trim: "Bez spacji na początku i końcu.",
  },
});

const TranslationMetaSchema = object()
  .shape({
    sourceLocale: string<Locale>().required(),
    sourceHash: string().required(),
    status: string<TranslationMeta["status"]>()
      .oneOf(["manual", "ai_generated", "reviewed"])
      .required(),
    generatedAt:
      mixed<NonNullable<TranslationMeta["generatedAt"]>>().optional(),
    generatedBy: string().optional(),
    generatedProvider: string().optional(),
    generatedModel: string().optional(),
    reviewedAt: mixed<NonNullable<TranslationMeta["reviewedAt"]>>().optional(),
    reviewedBy: string().optional(),
  })
  .default(undefined)
  .optional();

export const RegisterSchema = object().shape({
  displayName: string().max(60).required(),
  email: string().email().required(),
  password: string()
    .min(6)
    .required()
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])(?=.{6,})/,
      "Jedna wielka litera, jedna mała litera, jedna cyfra i jeden znak specjalny.",
    ),
});

export const LoginSchema = object().shape({
  email: string().email().required(),
  password: string().min(6).required(),
});

export const AdminLoginSchema = object().shape({
  email: string().email().required(),
  password: string().min(6).required(),
  remember: boolean().required().default(false),
});

export const ForgotSchema = object().shape({
  email: string().email().required(),
});

export const PasswordChangeSchema = object().shape({
  oldPassword: string().min(6).required(),
  newPassword: string()
    .min(6)
    .required()
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])(?=.{6,})/,
      "Jedna wielka litera, jedna mała litera, jedna cyfra i jeden znak specjalny.",
    ),
  confirmPassword: string()
    .oneOf([ref("newPassword")], "Hasła muszą być identyczne")
    .min(6)
    .required()
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])(?=.{6,})/,
      "Jedna wielka litera, jedna mała litera, jedna cyfra i jeden znak specjalny.",
    ),
});

export const AddAdminSchema = object().shape({
  email: string().email().required(),
});

export const RemoveAdminSchema = object().shape({
  email: string().email().required(),
});

export const UpdateAdminSchema = object().shape({
  email: string().email().required(),
  accessLevel: number().required(),
});

export const RegisterDeveloperSchema = object().shape({
  email: string().email().required(),
});

export const RemoveAccountSchema = object().shape({
  password: string().min(6).required("Pole jest wymagane."),
});

const DiscountSchema: ObjectSchema<
  Omit<Discount, "object" | "formattedValue">
> = object().shape({
  type: string<keyof typeof DiscountTypeEnum>()
    .defined()
    .required()
    .default(DiscountTypeEnum.PERCENTAGE),
  discountValue: number().required().default(0),
  discountedAmount: number().required().default(0),
  code: string().nullable().ensure(),
});

const InvoiceRecipientSchemaFields = {
  invoiceRecipientEnabled: boolean().optional().default(false),
  invoiceRecipientRole: string<InvoiceRecipientRole>()
    .oneOf([...invoiceRecipientRoles])
    .optional()
    .default("recipient"),
  invoiceRecipientRoleDescription: string()
    .optional()
    .default("")
    .when(
      ["invoiceRecipientEnabled", "invoiceRecipientRole"],
      ([invoiceRecipientEnabled, invoiceRecipientRole], schema) => {
        return invoiceRecipientEnabled === true &&
          invoiceRecipientRole === "other"
          ? schema.trim().required()
          : schema;
      },
    ),
  invoiceRecipientName: string().optional().default(""),
  invoiceRecipientNip: string().optional().default(""),
  invoiceRecipientStreet: string().optional().default(""),
  invoiceRecipientZip: string().optional().default(""),
  invoiceRecipientCity: string().optional().default(""),
  jstRecipientEnabled: boolean().optional().default(false),
  jstRecipientName: string().optional().default(""),
  jstRecipientNip: string().optional().default(""),
  jstRecipientStreet: string().optional().default(""),
  jstRecipientZip: string().optional().default(""),
  jstRecipientCity: string().optional().default(""),
};

export const AddressSchema: ObjectSchema<Address> = object().shape({
  name: string().ensure(),
  type: string<AddressTypeEnum>().optional().default(AddressTypeEnum.SHIPPING),
  nip: string().optional().default(""),
  companyName: string().optional().default(""),
  ...InvoiceRecipientSchemaFields,
  street: string().ensure().default(""),
  number: string().ensure().default(""),
  local: string().ensure().default(""),
  zip: string().ensure().default(""),
  city: string().ensure().default(""),
  country: string().required().default("Polska"),
  active: boolean().defined().default(true),
});

const OrderShippingSchema = AddressSchema.nullable().test(
  "has-shipping-destination",
  "Pole jest wymagane.",
  function (value) {
    if (!this.parent?.shippingOption) {
      return true;
    }

    return hasShippingDestination(value);
  },
);

export const ContactSchema: ObjectSchema<Contact> = object().shape({
  email: string().email().trim(),
  name: string().required(),
  phone: string(),
  active: boolean().defined(),
});

const AdminQuickOrderContactSchema: ObjectSchema<Contact> = object().shape({
  email: string().email().trim(),
  name: string().ensure(),
  phone: string().ensure(),
  active: boolean().defined().default(true),
});

const AdminQuickOrderShippingSchema = AddressSchema.nullable().test(
  "has-quick-order-shipping-destination",
  "Pole jest wymagane.",
  function (value) {
    const shippingOption = this.parent?.shippingOption;

    if (!shippingOption || shippingOption === ShippingOptions.PERSONAL_COLLECTION) {
      return true;
    }

    return hasShippingDestination(value);
  },
);

export const AnonymousPackageLabelAddressSchema: ObjectSchema<AnonymousPackageLabelAddress> =
  object().shape({
    labelName: string().ensure().default(""),
    company: string().ensure().default(""),
    name: string().ensure().default(""),
    street: string().ensure().default(""),
    city: string().ensure().default(""),
    zip: string().ensure().default(""),
    phone: string().ensure().default(""),
    email: string().ensure().default(""),
  });

export const NestedMemberSchema: ObjectSchema<NestedMember> = object().shape({
  id: string().required(),
  name: string().required(),
});

// Notification schemas
const NotificationOverrideSchema = object().shape({
  enabled: boolean().defined().default(false),
  email: string().email().optional(),
});

export const MemberNotificationSettingsSchema: ObjectSchema<MemberNotificationSettings> =
  object().shape({
    [NotificationType.NO_PAYMENT_DOCUMENTS]:
      NotificationOverrideSchema.optional(),
    [NotificationType.STALLED_ORDERS_REMINDER]:
      NotificationOverrideSchema.optional(),
    [NotificationType.CAMPAIGN_CREATED]: NotificationOverrideSchema.optional(),
    [NotificationType.NOTE_CREATED]: NotificationOverrideSchema.optional(),
    [NotificationType.COMPLAINT_CREATED]: NotificationOverrideSchema.optional(),
    [NotificationType.STORE_ORDER_CREATED]:
      NotificationOverrideSchema.optional(),
    [NotificationType.FULFILLMENT_REQUEST]:
      NotificationOverrideSchema.optional(),
    [NotificationType.PRODUCTION_COOPERATION_REQUEST]:
      NotificationOverrideSchema.optional(),
  });

export const ChannelNotificationSettingsSchema: ObjectSchema<ChannelNotificationSettings> =
  object().shape({
    enabledTypes: array().of(string<NotificationType>().required()).required(),
    email: string().email().optional(),
    emails: mixed<string[] | string>()
      .optional()
      .test(
        "emails-union",
        "Emails must be a valid email string or an array of valid email strings",
        (value) => {
          if (typeof value === "undefined" || value === null) return true;
          if (typeof value === "string") {
            // Accept empty string or valid email
            return value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          }
          if (Array.isArray(value)) {
            return value.every(
              (email) =>
                typeof email === "string" &&
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
            );
          }
          return false;
        },
      ), // Can be string[] or string
  });

const SupplierAttributeOptionSchema: ObjectSchema<SupplierAttributeOption> =
  object().shape({
    attributeId: string().required(),
    optionValue: string().required(),
  });

export const CustomerCreateSchema: ObjectSchema<CustomerCreateForm> =
  object().shape({
    name: string().required(),
    personName: string(),
    email: string().email(),
    nip: string(),
    allowedBankPayments: boolean().defined(),
    allowedOnPickupPayments: boolean().defined(),
    allowedDefferedPayments: boolean().defined(),
    contacts: array().of(ContactSchema),
    addresses: array().of(AddressSchema),
    specialNotes: string().ensure().max(500),
    discount: number().max(100).min(0).default(0),
    b2b: boolean().defined().default(false),
    customerGroupIds: array().of(string().required()).default([]),
    createdBy: NestedMemberSchema,
  });

export const CustomerUpdateSchema: ObjectSchema<CustomerUpdateForm> =
  object().shape({
    name: string().required(),
    personName: string(),
    email: string().email(),
    nip: string(),
    allowedBankPayments: boolean().defined(),
    allowedOnPickupPayments: boolean().defined(),
    allowedDefferedPayments: boolean().defined(),
    contacts: array().of(ContactSchema),
    addresses: array().of(AddressSchema),
    specialNotes: string().ensure().max(500),
    discount: number().max(100).min(0).default(0),
    b2b: boolean().defined().default(false),
    customerGroupIds: array().of(string().required()).default([]),
    updatedBy: NestedMemberSchema,
  });

export const NestedCustomerSchema: ObjectSchema<NestedCustomer> =
  object().shape({
    id: string().required(),
    name: string().required(),
    personName: string(),
    email: string().email(),
    nip: string(),
    allowedBankPayments: boolean().defined().default(false),
    allowedOnPickupPayments: boolean().defined().default(false),
    allowedDefferedPayments: boolean().defined().default(false),
    contacts: array().of(ContactSchema).default([]),
    addresses: array().of(AddressSchema).default([]),
    b2b: boolean().defined().default(false),
    linkedProductsIds: array().of(string().required()).default([]),
    customerGroupIds: array().of(string().required()).default([]),
    specialNotes: string().ensure().max(500),
    discount: number().max(100).min(0).default(0),
  });

export const CustomerGroupCreateSchema: ObjectSchema<CustomerGroupCreateForm> =
  object().shape({
    name: string().required(),
    description: string().nullable(),
    customerIds: array().of(string().required()).default([]),
    createdBy: NestedMemberSchema,
  });

export const CustomerGroupUpdateSchema: ObjectSchema<CustomerGroupUpdateForm> =
  object().shape({
    id: string().required(),
    name: string().required(),
    description: string().nullable(),
    customerIds: array().of(string().required()).default([]),
    archivedAt: mixed<Omit<Timestamp, "toJSON">>().nullable().optional(),
    updatedBy: NestedMemberSchema,
  });

export const SupplierCreateSchema: ObjectSchema<SupplierCreateForm> =
  object().shape({
    name: string().required(),
    companyName: string().required(),
    contactPerson: string(),
    email: string().email(),
    phone: string(),
    website: string().url(),
    nip: string(),
    regon: string(),
    krs: string(),
    contacts: array().of(ContactSchema),
    addresses: array().of(AddressSchema),
    specialNotes: string().ensure().max(500),
    paymentTerms: string(),
    currency: string(),
    isPreferred: boolean().defined().default(false),
    rating: number().min(1).max(5),
    leadTime: number().min(0),
    minimumOrder: number().min(0),
    supplierCode: string(),
    createdBy: NestedMemberSchema,
  });

export const SupplierUpdateSchema: ObjectSchema<SupplierUpdateForm> =
  object().shape({
    name: string().required(),
    companyName: string().required(),
    contactPerson: string(),
    email: string().email(),
    phone: string(),
    website: string().url(),
    nip: string(),
    regon: string(),
    krs: string(),
    contacts: array().of(ContactSchema),
    addresses: array().of(AddressSchema),
    specialNotes: string().ensure().max(500),
    paymentTerms: string(),
    currency: string(),
    isPreferred: boolean().defined(),
    rating: number().min(1).max(5),
    leadTime: number().min(0),
    minimumOrder: number().min(0),
    supplierCode: string(),
    updatedBy: NestedMemberSchema,
  });

const ProductShippingSchema = object().shape({
  types: array()
    .required()
    .default([
      ShippingTypes.CUSTOM,
      ShippingTypes.PERSONAL_COLLECTION,
      ShippingTypes.COURIER,
      ShippingTypes.PARCEL_DELIVERY_LOCKER,
    ]),
});

const ProductSpecSchema: ObjectSchema<Product["spec"]> = object().shape({
  images: array().of(string().required()).defined(),
  defaultOrder: number().defined().positive(),
  minimumOrder: number().defined().positive(),
  maximumOrder: number().defined().positive(),
  step: number().defined().positive(),
  minimumWidth: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
  maximumWidth: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
  widthStep: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
  minimumHeight: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
  maximumHeight: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
  heightStep: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
  validateRatio: boolean().optional(),
  minimumRatio: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
  maximumRatio: lazy((value) => {
    if (!isUndefined(value) && value !== "" && value > 0) {
      return number().positive();
    } else return number().optional();
  }),
});

const ProductDesignSpecSchema: ObjectSchema<Product["designSpec"]> =
  object().shape({
    dpi: number(),
    bleed: number(),
    includeBleed: boolean(),
  });

const AvailabilitySchema: ObjectSchema<
  Omit<Product["availability"], "publication" | "expiration">
> = object().shape({
  published: boolean().defined(),
  publicationString: string(),
  availableForPurchase: boolean().defined(),
  expirationString: string(),
});

const VolumeSchema: ObjectSchema<Volume> = object().shape({
  value: number().required().default(1),
  deliveryTime: number().required().default(1),
  markup: number()
    .optional()
    .transform((value: number) => (isNaN(value) ? undefined : value)),
  printType: string<PrintingMethodId>().optional(),
});

const VolumeWithoutDeliveryTimeSchema: ObjectSchema<
  Omit<Volume, "deliveryTime">
> = object().shape({
  value: number().required().default(1),
  markup: number()
    .optional()
    .transform((value: number) => (isNaN(value) ? undefined : value)),
  printType: string<PrintingMethodId>().optional(),
});

const CombinationSchema: ObjectSchema<Combination> = object().shape({
  id: string().required().default(DEFAULT_COMBINATION),
  active: boolean().defined().default(true),
  customFormat: boolean().defined().default(false),
});

const PriceSchema: ObjectSchema<Price> = object().shape({
  value: number()
    .transform((value: number) => (isNaN(value) ? undefined : value))
    .nullable(),
  currency: string<CurrencyEnum>().required(),
  taxCategoryId: string().optional(),
  threshold: number().transform((value: number) =>
    isNaN(value) ? undefined : value,
  ),
  combination: CombinationSchema.optional(),
  volume: VolumeSchema.optional(),
});

const PageCountNumberSchema = number()
  .transform((value: number) => (isNaN(value) ? undefined : value))
  .integer()
  .positive();

const ProductPageCountPricingSchema: ObjectSchema<
  NonNullable<Product["pageCount"]>["pricing"]
> = object().shape({
  mode: string<"step" | "segmented" | "exact">().optional(),
  stepPrices: array().of(PriceSchema).optional(),
  segments: array()
    .of(
      object().shape({
        minimum: PageCountNumberSchema.required(),
        maximum: PageCountNumberSchema.required(),
      }),
    )
    .optional(),
  segmentPrices: array()
    .of(
      object().shape({
        minimum: PageCountNumberSchema.required(),
        maximum: PageCountNumberSchema.required(),
        basePrices: array().of(PriceSchema).required(),
        stepPrices: array().of(PriceSchema).required(),
      }),
    )
    .optional(),
  exactPrices: array()
    .of(
      object().shape({
        pageCount: PageCountNumberSchema.required(),
        prices: array().of(PriceSchema).required(),
      }),
    )
    .optional(),
});

const ProductPageCountConstraintSchema = object().shape({
  conditions: array()
    .of(
      object().shape({
        attributeId: string().required(),
        optionValues: array().of(string().required()).required(),
      }),
    )
    .required(),
  minimum: PageCountNumberSchema.optional(),
  maximum: PageCountNumberSchema.optional(),
  step: PageCountNumberSchema.optional(),
});

const ProductPageCountSchema: ObjectSchema<NonNullable<Product["pageCount"]>> =
  object()
    .shape({
      enabled: boolean().defined(),
      minimum: PageCountNumberSchema.required(),
      maximum: PageCountNumberSchema.required(),
      step: PageCountNumberSchema.required(),
      coverPages: PageCountNumberSchema.required(),
      externalAttributeName: string().trim().optional(),
      placement: object()
        .shape({
          afterAttributeId: string().nullable().optional(),
        })
        .optional(),
      constraints: array().of(ProductPageCountConstraintSchema).optional(),
      pricing: ProductPageCountPricingSchema.optional(),
    })
    .test(
      "page-count-range",
      "Page count minimum cannot exceed maximum",
      (value) =>
        !value?.enabled ||
        value.minimum === undefined ||
        value.maximum === undefined ||
        value.minimum <= value.maximum,
    )
    .test(
      "page-count-divisibility",
      "Page count values must be divisible by 4",
      (value) =>
        !value?.enabled ||
        [value.minimum, value.maximum, value.step, value.coverPages]
          .filter((entry): entry is number => typeof entry === "number")
          .every((entry) => entry % 4 === 0),
    );

const DYNAMIC_PRICING_ADJUSTMENT_MIN = -1_000_000;
const DYNAMIC_PRICING_ADJUSTMENT_MAX = 1_000_000;
const DYNAMIC_PRICING_BASE_PRICE_MAX = 1_000_000_000;

const DynamicPricingInputSchema = object().shape({
  id: string().required().max(200),
  label: string().required().max(200),
  value: number()
    .required()
    .min(DYNAMIC_PRICING_ADJUSTMENT_MIN)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  unit: string().optional().max(40),
});

const DynamicPricingConditionSchema = object().shape({
  attributeId: string().required().max(200),
  optionValues: array().of(string().required().max(200)).required().max(200),
});

const DynamicPricingAttributeAdjustmentSchema = object().shape({
  optionValue: string().required().max(200),
  priceAdjustment: number()
    .optional()
    .min(DYNAMIC_PRICING_ADJUSTMENT_MIN)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  deliveryTimeAdjustment: number()
    .optional()
    .min(DYNAMIC_PRICING_ADJUSTMENT_MIN)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
});

const DynamicPricingAttributeRuleSchema = object().shape({
  attributeId: string().required().max(200),
  mode: string<"ignore" | "adjust">().required(),
  adjustments: array()
    .of(DynamicPricingAttributeAdjustmentSchema)
    .required()
    .max(500),
});

const DynamicPricingGlobalRuleSchema = object().shape({
  id: string().required().max(200),
  label: string().required().max(200),
  target: string<"price" | "deliveryTime">().required(),
  calculator: string<"fixed" | "multiplier" | "range" | "tier">().required(),
  fixedValue: number()
    .optional()
    .min(DYNAMIC_PRICING_ADJUSTMENT_MIN)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  multiplier: number()
    .optional()
    .min(DYNAMIC_PRICING_ADJUSTMENT_MIN)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  metric: string<
    | "quantity"
    | "volume"
    | "pageCount"
    | "width"
    | "height"
    | "area"
    | "perimeter"
    | "itemsPerSheet"
    | "sheetsNeeded"
    | "innerSheetsPerUnit"
    | "coverSheetsPerUnit"
    | "totalSheetsPerUnit"
    | "innerSheetVolume"
    | "coverSheetVolume"
    | "totalSheetVolume"
  >().optional(),
  inputId: string().optional().max(200),
  outputMultiplierMetric: string<
    | "quantity"
    | "volume"
    | "pageCount"
    | "width"
    | "height"
    | "area"
    | "perimeter"
    | "itemsPerSheet"
    | "sheetsNeeded"
    | "innerSheetsPerUnit"
    | "coverSheetsPerUnit"
    | "totalSheetsPerUnit"
    | "innerSheetVolume"
    | "coverSheetVolume"
    | "totalSheetVolume"
  >().optional(),
  outputMultiplierInputId: string().optional().max(200),
  minimumMetricValue: number()
    .optional()
    .min(0)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  maximumMetricValue: number()
    .optional()
    .min(0)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  minimumOutputValue: number()
    .optional()
    .min(DYNAMIC_PRICING_ADJUSTMENT_MIN)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  maximumOutputValue: number()
    .optional()
    .min(DYNAMIC_PRICING_ADJUSTMENT_MIN)
    .max(DYNAMIC_PRICING_ADJUSTMENT_MAX),
  inverse: boolean().optional(),
  conditions: array().of(DynamicPricingConditionSchema).optional().max(50),
});

const DynamicPricingSchema: ObjectSchema<
  NonNullable<Product["dynamicPricing"]>
> = object().shape({
  enabled: boolean().defined(),
  basePrice: number().required().min(0).max(DYNAMIC_PRICING_BASE_PRICE_MAX),
  baseDeliveryTime: number().optional().min(0).max(365),
  inputs: array().of(DynamicPricingInputSchema).optional().max(50),
  linkedPresetIds: array().of(string().required().max(200)).optional().max(100),
  globalRules: array().of(DynamicPricingGlobalRuleSchema).required().max(100),
  attributeRules: array()
    .of(DynamicPricingAttributeRuleSchema)
    .required()
    .max(100),
});

const PRODUCT_PRICE_OFFSET_RULE_SCOPES: ProductPriceOffsetRuleScope[] = [
  "product",
  "attributeOption",
  "configuration",
];

const PriceOffsetNumberSchema = number()
  .transform((value: number) => (isNaN(value) ? undefined : value))
  .test(
    "finite-price-offset-number",
    "Offset value must be finite.",
    (value) => value === undefined || Number.isFinite(value),
  );

const ProductPriceOffsetRuleSchema = object()
  .shape({
    id: string().trim().required().max(120),
    enabled: boolean().defined().default(true),
    label: string().trim().max(120).optional(),
    scope: string<ProductPriceOffsetRuleScope>()
      .required()
      .oneOf(PRODUCT_PRICE_OFFSET_RULE_SCOPES),
    percent: PriceOffsetNumberSchema.min(-1000).max(1000).optional(),
    fixedValue: PriceOffsetNumberSchema.integer()
      .min(-1_000_000_000)
      .max(1_000_000_000)
      .optional(),
    attributeId: string().trim().max(200).optional(),
    optionValue: string().trim().max(200).optional(),
    calculatedCombination: string().trim().max(1000).optional(),
    volumeValue: PriceOffsetNumberSchema.min(0).optional(),
    pageCount: PageCountNumberSchema.optional(),
  })
  .test(
    "price-offset-has-effect",
    "Offset rule needs a percent or fixed adjustment.",
    (value) =>
      value === undefined ||
      value.percent !== undefined ||
      value.fixedValue !== undefined,
  )
  .test(
    "price-offset-scope-fields",
    "Offset rule scope is incomplete.",
    (value) => {
      if (!value) {
        return true;
      }

      if (value.scope === "attributeOption") {
        return Boolean(value.attributeId && value.optionValue);
      }

      if (value.scope === "configuration") {
        return Boolean(value.calculatedCombination);
      }

      return true;
    },
  );

const ProductPriceOffsetSchema: ObjectSchema<ProductPriceOffsetConfig> =
  object().shape({
    enabled: boolean().defined().default(false),
    rules: array()
      .of(ProductPriceOffsetRuleSchema)
      .defined()
      .default([])
      .max(250),
  });

const NestedCategorySchema: ObjectSchema<NestedCategory> = object().shape({
  id: string().required(),
  name: string().required(),
  parentId: string().nullable().optional(),
  path: array()
    .of(
      object({
        id: string().required(),
        name: string().required(),
      }).required(),
    )
    .optional(),
});

const NestedProductTypeSchema: ObjectSchema<NestedProductType> = object().shape(
  {
    id: string().required(),
    name: string().required(),
    attributes: array().required(),
    isShippable: boolean().required(),
  },
);

function isEmptyNestedProductType(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return true;
  }

  const id = (value as { id?: unknown }).id;

  return typeof id !== "string" || id.trim().length === 0;
}

const OptionalNestedProductTypeSchema = object()
  .nullable()
  .notRequired()
  .transform((value, originalValue) =>
    isEmptyNestedProductType(originalValue) ? null : value,
  )
  .shape({
    id: string().required(),
    name: string().required(),
    attributes: array().required(),
    isShippable: boolean().required(),
  });

const SeoSchema = object().shape({
  slug: string().trim().ensure(),
  title: string().ensure(),
  description: string().ensure(),
});

const NestedProductSchema: ObjectSchema<NestedProduct> = object().shape({
  id: string().required(),
  name: string().required(),
  prices: array().required(),
  defaultPrice: PriceSchema,
  lowPrice: PriceSchema,
  highPrice: PriceSchema,
  taxCategoryId: string().optional(),
  description: string().ensure(),
  volumes: array().required(),
  attributes: array().required(),
  attributeOptions: object(),
  attributeDependencies: object().optional(),
  customSize: boolean().required().default(false),
  allowCustomPrice: boolean().required().default(false),
  recommended: boolean().required().default(false),
  difficulty: number().required().default(1),
  shipping: ProductShippingSchema,
  spec: ProductSpecSchema,
  designSpec: object(),
  category: NestedCategorySchema,
  seo: SeoSchema,
  productType: NestedProductTypeSchema.when("priceType", {
    is: (priceType: PriceTypeEnum) =>
      priceType === PriceTypeEnum.MATRIX || priceType === PriceTypeEnum.DYNAMIC,
    then: () => OptionalNestedProductTypeSchema,
    otherwise: (schema) => schema.notRequired().transform(() => null),
  }),
  priceType: string<PriceTypeEnum>().required(),
  prefferedUnit: string<Unit>().required(),
  availability: object(),
  keywords: array(),
  threeDModel: string<ThreeDModels>().optional().nullable(),
  channelId: string(),
  deadlineDeliveryTime: number().optional(),
  linkedWarehouses: array().of(string().required()).optional(),
  designatedPickupAreaIds: array().of(string().required()).optional(),
  // Optional external pricing provider integration
  provider: object()
    .shape({
      type: string(),
      productId: string(),
    })
    .optional(),
  disablePriceFetch: boolean().optional(),
  pageCount: ProductPageCountSchema.optional().default(undefined),
  dynamicPricing: DynamicPricingSchema.optional().default(undefined),
  priceOffsets: ProductPriceOffsetSchema.optional().default(undefined),
});

export const ToChannelSchema = object()
  .shape({
    id: string(),
  })
  .optional();

const PreviewSchema = object().shape({
  width: number(),
  height: number(),
  pages: number(),
});

const AdvancedGrommetsSchema = object({
  sides: array().of(string<AdvancedEdgeSide>().required()).required(),
  spacing: number().required(),
  offsetStart: number().optional(),
  offsetEnd: number().optional(),
})
  .optional()
  .default(undefined);

const OrderItemAdvancedAttributeSelectionSchema = object({
  preset: string().optional(),
  reinforcementSides: array()
    .of(string<AdvancedEdgeSide>().required())
    .required()
    .ensure(),
  tunnelSides: array()
    .of(string<AdvancedEdgeSide>().required())
    .required()
    .ensure(),
  grommets: AdvancedGrommetsSchema,
  cutToSize: boolean().optional(),
  notes: string().optional(),
});

const OrderItemFulfillmentAssignmentSchema: ObjectSchema<OrderItemFulfillmentAssignment> =
  object().shape({
    requestId: string().required(),
    warehouseId: string().required(),
    assignmentSource: string<
      NonNullable<OrderItemFulfillmentAssignment["assignmentSource"]>
    >()
      .oneOf(["DIRECT", "FULFILLMENT_REQUEST"])
      .optional(),
    sourceTenantId: string().optional(),
    targetTenantId: string().optional(),
    cooperationId: string().optional(),
    acceptedAt:
      mixed<
        NonNullable<OrderItemFulfillmentAssignment["acceptedAt"]>
      >().optional(),
    acceptedBy: NestedMemberSchema.optional(),
  });

export const OrderItemSchema: ObjectSchema<OrderItem> = object().shape({
  id: string().ensure(),
  name: string().ensure(),
  product: NestedProductSchema.optional(),
  description: string().ensure(),
  combination: string().nullable(),
  calculatedCombination: string().nullable(),
  volume: number(),
  pageCount: number().nullable().optional(),
  customFormat: boolean().required(),
  totalPrice: number().required(),
  customPrice: number().nullable().default(null),
  width: number(),
  height: number(),
  quantity: number().required(),
  customSizes: array()
    .of(
      object().shape({
        width: number().required(),
        height: number().required(),
        quantity: number().positive().required(),
      }),
    )
    .optional(),
  discount: DiscountSchema,
  unit: string<Unit>().required(),
  printingMethods: array().of(string<PrintingMethodId>().required()).optional(),
  expressPercent: number().optional(),
  preview: PreviewSchema.optional(),
  advancedAttributeSelections: mixed()
    .test(
      "advanced-attribute-selections",
      "Invalid advanced attribute selections",
      (value) => {
        if (typeof value === "undefined") {
          return true;
        }

        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return false;
        }

        return Object.values(value).every((selection) =>
          OrderItemAdvancedAttributeSelectionSchema.isValidSync(selection),
        );
      },
    )
    .optional(),
  carriedOutBy: array().of(string().required()).required().ensure(),
  warehouseId: string().optional(),
  fulfillmentAssignment:
    OrderItemFulfillmentAssignmentSchema.optional().default(undefined),
  priceListApplication: object()
    .shape({
      entryId: string().required(),
      priceListId: string().required(),
    })
    .optional()
    .default(undefined),
  taxCategoryId: string().optional(),
});

const OrderItemsSchema = array()
  .transform((items: unknown) => {
    if (!Array.isArray(items)) {
      return items;
    }

    return items.filter((item) => !isEmptyOrderItem(item));
  })
  .of(OrderItemSchema);

const OrderItemsStrictSchema = array()
  .transform((items: unknown) => {
    if (!Array.isArray(items)) {
      return items;
    }

    return items.filter((item) => !isEmptyOrderItem(item));
  })
  .of(OrderItemSchema)
  .min(1, "Pole jest wymagane.")
  .test(
    "items-have-product",
    "Każda pozycja zamówienia musi mieć wybrany produkt.",
    (items) => {
      if (!Array.isArray(items)) {
        return true;
      }

      return items.every(
        (item) =>
          typeof item?.product?.id === "string" &&
          item.product.id.length > 0 &&
          typeof item?.product?.name === "string" &&
          item.product.name.length > 0,
      );
    },
  );

export const MemberCreateSchema: ObjectSchema<MemberCreateForm> =
  object().shape({
    name: string().required(),
    email: string().email(),
    phone: string(),
    avatarUrl: string().optional(),
    channelIds: array().of(string().required()).optional(),
    notifications: MemberNotificationSettingsSchema.optional(),
  });

export const MemberUpdateSchema: ObjectSchema<MemberUpdateForm> =
  object().shape({
    name: string().required(),
    email: string().email(),
    phone: string(),
    avatarUrl: string().optional(),
    channelIds: array().of(string().required()).optional(),
    notifications: MemberNotificationSettingsSchema.optional(),
  });

export const TrackingSchema: ObjectSchema<Tracking> = object().shape({
  shippingOption: string<ShippingOptions>().required(),
  number: string().required(),
  link: string().required(),
  pickupAt: mixed<any>().optional(),
  deliveredAt: mixed<any>().optional(),
  lastScan: mixed<any>().optional(),
  scans: array().optional(),
});

const ExternalOrderLineItemSourceSchema = object().shape({
  externalLineItemId: string().required(),
  externalOfferId: string().ensure().optional(),
  externalOfferName: string().ensure().optional(),
});

const hasExternalOrderSourceValue = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).some((fieldValue) => {
    if (typeof fieldValue === "string") {
      return fieldValue.trim().length > 0;
    }

    if (Array.isArray(fieldValue)) {
      return fieldValue.length > 0;
    }

    return !isUndefined(fieldValue) && fieldValue !== null;
  });
};

const ExternalOrderSourceObjectSchema: ObjectSchema<ExternalOrderSource> =
  object().shape({
    provider: string().oneOf(["ALLEGRO"]).required(),
    externalOrderId: string().required(),
    externalOrderRevision: string().ensure().optional(),
    externalBuyerId: string().ensure().optional(),
    externalBuyerLogin: string().ensure().optional(),
    externalPaymentId: string().ensure().optional(),
    externalDeliveryMethodId: string().ensure().optional(),
    externalDeliveryMethodName: string().ensure().optional(),
    externalStatus: string().ensure().optional(),
    externalFulfillmentStatus: string().ensure().optional(),
    externalPaymentStatus: string().ensure().optional(),
    externalUpdatedAt: string().ensure().optional(),
    fulfillmentProvider: string().oneOf(["SELLER", "ALLEGRO"]).optional(),
    marketplaceId: string().ensure().optional(),
    pickupPointId: string().ensure().optional(),
    pickupPointName: string().ensure().optional(),
    externallyFulfilled: boolean().optional(),
    importedAt: mixed<Omit<Timestamp, "toJSON">>().optional(),
    lastSyncedAt: mixed<Omit<Timestamp, "toJSON">>().optional(),
    lineItems: array().of(ExternalOrderLineItemSourceSchema).optional(),
  });

const ExternalOrderSourceSchema = lazy((value) => {
  if (!hasExternalOrderSourceValue(value)) {
    return mixed<ExternalOrderSource>()
      .nullable()
      .transform(() => null);
  }

  return ExternalOrderSourceObjectSchema;
});

export const StoreContactSchema: ObjectSchema<Contact> = object().shape({
  email: string().email().required(),
  name: string().required(),
  phone: string(),
  active: boolean().defined(),
});

export const PaymentDocumentSchema: ObjectSchema<{
  paymentDocumentId?: string;
  proformaDocumentId?: string;
}> = object().shape({
  paymentDocumentId: string(),
  proformaDocumentId: string(),
});

export const CarriedOutBySchema: ObjectSchema<{
  carriedOutBy: string[];
}> = object().shape({
  carriedOutBy: array().of(string().required()).required(),
});

export const QuoteCreateSchema: ObjectSchema<QuoteCreateForm> = object().shape({
  customer: lazy((value) => {
    switch (typeof value) {
      case "string":
        return string().ensure();
      case "object":
        return NestedCustomerSchema.required();
      default:
        return string().ensure();
    }
  }),
  contact: ContactSchema,
  items: OrderItemsSchema.required(),
  shippingOption: string<ShippingOptions>().required(),
  specialNotes: string().ensure().max(500),
  createdBy: NestedMemberSchema,
  mailLink: string().ensure().max(500).optional(),
  appliedPromotionCodes: array().of(string().required()).required(),
});

export const QuoteUpdateSchema: ObjectSchema<QuoteUpdateForm> = object().shape({
  customer: lazy((value) => {
    switch (typeof value) {
      case "string":
        return string().ensure();
      case "object":
        return NestedCustomerSchema.required();
      default:
        return string().ensure();
    }
  }),
  contact: ContactSchema,
  items: OrderItemsSchema.required(),
  shippingOption: string<ShippingOptions>().required(),
  specialNotes: string().ensure().max(500),
  updatedBy: NestedMemberSchema,
  mailLink: string().ensure().max(500).optional(),
  appliedPromotionCodes: array().of(string().required()).required(),
});

export const CategoryCreateSchema: ObjectSchema<CategoryCreateForm> =
  object().shape({
    name: string().required(),
    description: string(),
    parentId: string().nullable().optional(),
    seo: SeoSchema,
    createdBy: NestedMemberSchema,
    toChannel: ToChannelSchema,
  });

export const CategoryUpdateSchema: ObjectSchema<CategoryUpdateForm> =
  object().shape({
    name: string().required(),
    description: string(),
    parentId: string().nullable().optional(),
    seo: SeoSchema,
    updatedBy: NestedMemberSchema,
  });

export const ChannelCreateSchema: ObjectSchema<ChannelCreateForm> =
  object().shape({
    name: string().required(),
    currency: string<CurrencyEnum>().required(),
    warehouses: array().of(string().required()).required(),
    createdBy: NestedMemberSchema,
    notifications: ChannelNotificationSettingsSchema.optional(),
  });

export const ChannelUpdateSchema: ObjectSchema<ChannelUpdateForm> =
  object().shape({
    name: string().required(),
    currency: string<CurrencyEnum>().required(),
    warehouses: array().of(string().required()).required(),
    updatedBy: NestedMemberSchema,
    notifications: ChannelNotificationSettingsSchema.optional(),
  });

export const DesignatedPickupAreaCreateSchema: ObjectSchema<DesignatedPickupAreaCreateForm> =
  object().shape({
    name: string().required(),
    warehouseId: string().required(),
    description: string().optional(),
    shippingOptions: array().of(string().required()).optional(),
    createdBy: NestedMemberSchema,
  });

export const DesignatedPickupAreaUpdateSchema: ObjectSchema<DesignatedPickupAreaUpdateForm> =
  object().shape({
    name: string().required(),
    warehouseId: string().required(),
    description: string().optional(),
    shippingOptions: array().of(string().required()).optional(),
    updatedBy: NestedMemberSchema,
  });

export const WarehouseCreateSchema: ObjectSchema<WarehouseCreateForm> =
  object().shape({
    name: string().required(),
    contacts: array().of(ContactSchema).required(),
    address: AddressSchema,
    createdBy: NestedMemberSchema,
  });

export const WarehouseUpdateSchema: ObjectSchema<WarehouseUpdateForm> =
  object().shape({
    name: string().required(),
    contacts: array().of(ContactSchema).required(),
    address: AddressSchema,
    updatedBy: NestedMemberSchema,
  });

export const MessageSchema: ObjectSchema<
  Omit<Message, "updatedAt" | "updatedBy" | "createdAt">
> = object().shape({
  value: string().required(),
  createdBy: NestedMemberSchema,
});

export const ProductCreateSchema: ObjectSchema<ProductCreateForm> =
  object().shape({
    priceType: string<PriceTypeEnum>().required(),
    name: string().required(),
    description: string().ensure(),
    category: NestedCategorySchema,
    difficulty: number().required(),
    recommended: boolean().defined(),
    customSize: boolean().defined(),
    customSizes: array()
      .of(
        object().shape({
          label: string().required(),
          width: number().required(),
          height: number().required(),
        }),
      )
      .optional(),
    allowCustomPrice: boolean().defined(),
    active: boolean().defined(),
    prefferedUnit: string<Unit>().required(),
    shipping: object()
      .shape({
        types: array().of(string<ShippingTypes>().required()).required(),
      })
      .required(),
    spec: ProductSpecSchema,
    designSpec: ProductDesignSpecSchema,
    seo: SeoSchema,
    availability: AvailabilitySchema,
    volumes: array().of(VolumeWithoutDeliveryTimeSchema).required(),
    prices: array().of(PriceSchema).required(),
    defaultPrice: PriceSchema,
    lowPrice: PriceSchema,
    highPrice: PriceSchema,
    attributes: array().of(string().required()).required(),
    attributeOptions: object().required(),
    attributeDependencies: object().optional(),
    pageCount: ProductPageCountSchema.optional().default(undefined),
    dynamicPricing: DynamicPricingSchema.optional().default(undefined),
    priceOffsets: ProductPriceOffsetSchema.optional().default(undefined),
    productType: NestedProductTypeSchema.when("priceType", {
      is: (priceType: PriceTypeEnum) =>
        priceType === PriceTypeEnum.MATRIX ||
        priceType === PriceTypeEnum.DYNAMIC,
      then: () => OptionalNestedProductTypeSchema,
      otherwise: (schema) => schema.notRequired().transform(() => null),
    }),
    createdBy: NestedMemberSchema,
    toChannel: ToChannelSchema,
    threeDModel: string<ThreeDModels>().optional().nullable(),
    channelId: string().defined(),
    specialNotes: string().ensure().max(500),
    designatedPickupAreaIds: array().of(string().required()).optional(),
    // Optional external pricing provider integration
    provider: object()
      .shape({
        type: string().optional(),
        productId: string().optional(),
      })
      .optional(),
    disablePriceFetch: boolean().optional(),
    taxCategoryId: string().optional(),
  });

export const ProductUpdateSchema: ObjectSchema<ProductUpdateForm> =
  object().shape({
    priceType: string<PriceTypeEnum>().required(),
    name: string().required(),
    description: string().ensure(),
    category: NestedCategorySchema,
    difficulty: number().required(),
    recommended: boolean().defined(),
    customSize: boolean().defined(),
    customSizes: array()
      .of(
        object().shape({
          label: string().required(),
          width: number().required(),
          height: number().required(),
        }),
      )
      .optional(),
    allowCustomPrice: boolean().defined(),
    active: boolean().defined(),
    prefferedUnit: string<Unit>().required(),
    shipping: object()
      .shape({
        types: array().of(string<ShippingTypes>().required()).required(),
      })
      .required(),
    spec: ProductSpecSchema,
    designSpec: ProductDesignSpecSchema,
    seo: SeoSchema,
    availability: AvailabilitySchema,
    volumes: array().of(VolumeWithoutDeliveryTimeSchema).required(),
    prices: array().of(PriceSchema).required(),
    defaultPrice: PriceSchema,
    lowPrice: PriceSchema,
    highPrice: PriceSchema,
    attributes: array().of(string().required()).required(),
    attributeOptions: object().required(),
    attributeDependencies: object().required(),
    pageCount: ProductPageCountSchema.optional().default(undefined),
    dynamicPricing: DynamicPricingSchema.optional().default(undefined),
    priceOffsets: ProductPriceOffsetSchema.optional().default(undefined),
    productType: NestedProductTypeSchema.when("priceType", {
      is: (priceType: PriceTypeEnum) =>
        priceType === PriceTypeEnum.MATRIX ||
        priceType === PriceTypeEnum.DYNAMIC,
      then: () => OptionalNestedProductTypeSchema,
      otherwise: (schema) => schema.notRequired().transform(() => null),
    }),
    updatedBy: NestedMemberSchema,
    threeDModel: string<ThreeDModels>().optional().nullable(),
    channelId: string().defined(),
    specialNotes: string().ensure().max(500),
    designatedPickupAreaIds: array().of(string().required()).optional(),
    // Optional external pricing provider integration
    provider: object()
      .shape({
        type: string().optional(),
        productId: string().optional(),
      })
      .optional(),
    disablePriceFetch: boolean().optional(),
    taxCategoryId: string().optional(),
  });

const AdvancedPresetSchema = object({
  reinforcementSides: array()
    .of(string<AdvancedEdgeSide>().required())
    .optional(),
  tunnelSides: array().of(string<AdvancedEdgeSide>().required()).optional(),
  grommets: AdvancedGrommetsSchema,
  cutToSize: boolean().optional(),
})
  .optional()
  .default(undefined);

const AttributeOptionSchema: ObjectSchema<Option> = object().shape({
  label: string().required(),
  value: string()
    .required()
    .matches(
      /^[a-zA-Z0-9+]+$/,
      "Bez spacji, bez polskich znaków, każdy następny wyraz wielką literą (prócz pierwszego), np. papierOzdobny",
    ),
  customFormat: boolean().defined(),
  hidden: boolean().defined(),
  formatWidth: number()
    .transform((value) => (Number.isNaN(value) ? null : value))
    .nullable()
    .optional(),
  formatHeight: number()
    .transform((value) => (Number.isNaN(value) ? null : value))
    .nullable()
    .optional(),
  pages: number().nullable().optional(),
  cost: number()
    .transform((value) => (Number.isNaN(value) ? null : value))
    .nullable()
    .optional(),
  unitsPerSheet: number()
    .transform((value) => (Number.isNaN(value) ? null : value))
    .nullable()
    .optional(),
  image: string().optional(),
  color: string().optional(),
  advancedPreset: AdvancedPresetSchema,
});

const CalculateStockFromSheetSchema: ObjectSchema<CalculateStockFromSheet> =
  object().shape({
    enabled: boolean().defined().default(false),
    sheetWidth: number().defined().default(0),
    sheetHeight: number().defined().default(0),
    margin: number().defined().default(0),
    bleed: number().defined().default(3),
  });

export const AttributeCreateSchema: ObjectSchema<AttributeCreateForm> =
  object().shape({
    id: string()
      .required()
      .matches(
        /^[a-zA-Z]+$/,
        "Bez spacji, bez polskich znaków, każdy następny wyraz wielką literą (prócz pierwszego), np. papierOzdobny",
      ),
    name: string().required(),
    calculated: boolean().defined(),
    required: boolean().defined(),
    format: boolean().defined(),
    pages: boolean().defined(),
    type: string<AttributeInputTypeEnum>().required(),
    options: array().of(AttributeOptionSchema).required(),
    trackStock: boolean().defined().default(false),
    calculateStockFromSheet: CalculateStockFromSheetSchema.optional(),
    costUnit: string<FakturowniaCostUnit>()
      .oneOf(["piece", "area_m2", "sheet", "metre"])
      .optional(),
    createdBy: NestedMemberSchema,
  });

export const AttributeUpdateSchema: ObjectSchema<AttributeUpdateForm> =
  object().shape({
    id: string()
      .required()
      .matches(
        /^[a-zA-Z]+$/,
        "Bez spacji, bez polskich znaków, każdy następny wyraz wielką literą (prócz pierwszego), np. papierOzdobny",
      ),
    name: string().required(),
    calculated: boolean().defined(),
    required: boolean().defined(),
    format: boolean().defined(),
    pages: boolean().defined(),
    type: string<AttributeInputTypeEnum>().required(),
    options: array().of(AttributeOptionSchema).required(),
    trackStock: boolean().defined().default(false),
    calculateStockFromSheet: CalculateStockFromSheetSchema.optional(),
    costUnit: string<FakturowniaCostUnit>()
      .oneOf(["piece", "area_m2", "sheet", "metre"])
      .optional(),
    updatedBy: NestedMemberSchema,
  });

export const ProductTypeCreateSchema: ObjectSchema<ProductTypeCreateForm> =
  object().shape({
    id: string()
      .required()
      .matches(
        /^[a-zA-Z]+$/,
        "Bez spacji, bez polskich znaków, każdy następny wyraz wielką literą (prócz pierwszego), np. papierOzdobny",
      ),
    name: string().required(),
    attributes: array().of(string().required()).required(),
    isShippable: boolean().defined(),
    createdBy: NestedMemberSchema,
    toChannel: ToChannelSchema,
  });

export const ProductTypeUpdateSchema: ObjectSchema<ProductTypeUpdateForm> =
  object().shape({
    id: string()
      .required()
      .matches(
        /^[a-zA-Z]+$/,
        "Bez spacji, bez polskich znaków, każdy następny wyraz wielką literą (prócz pierwszego), np. papierOzdobny",
      ),
    name: string().required(),
    attributes: array().of(string().required()).required(),
    isShippable: boolean().defined(),
    updatedBy: NestedMemberSchema,
  });

export const StoreSettingsSchema: ObjectSchema<StoreSettingsForm> =
  object().shape({
    buying: object()
      .shape({
        enabled: boolean().defined(),
        max: number().defined().positive(),
        min: number().defined().positive(),
      })
      .required(),
    shippingOptionsPrices: object().shape({
      [ShippingOptions.PERSONAL_COLLECTION]: number().defined(),
      [ShippingOptions.PACZKOMATY_INPOST]: number().defined(),
      [ShippingOptions.INPOST]: number().defined(),
      [ShippingOptions.FEDEX]: number().defined(),
      [ShippingOptions.DPD]: number().defined(),
      [ShippingOptions.DHL]: number().defined(),
      [ShippingOptions.CUSTOM]: number().defined(),
      [ShippingOptions.COMPANY_COURIER]: number().defined(),
    }),
    freeShipping: object()
      .shape({
        enabled: boolean().defined(),
        min: number().defined().positive(),
      })
      .required(),
    underConstruction: object()
      .shape({
        enabled: boolean().defined(),
        message: string().required().default(""),
      })
      .required(),
    checkout: object()
      .shape({
        invoiceEnabled: boolean().defined().default(true),
        stockPolicy: mixed<StoreCheckoutStockPolicy>()
          .oneOf([...storeCheckoutStockPolicies])
          .defined()
          .default("allow"),
      })
      .optional()
      .default({ invoiceEnabled: true, stockPolicy: "allow" }),
    express: object()
      .shape({
        enabled: boolean().defined(),
        percent: number().defined().min(0).max(100),
      })
      .required(),
  });

const MetadataSchema = object<dbMetadataUpdate>({
  title: string().required(),
  description: string().required(),
  keywords: string().required(),
  ogTitle: string().ensure(),
  ogDescription: string().ensure(),
  ogImage: string().ensure(),
});

export type MetadataRecord = Record<string, dbMetadataUpdate>;

export const StoreMetadataSchema = object<MetadataRecord>({
  [T_STORE_MAIN_LAYOUT]: MetadataSchema,
  [T_STORE_HOME]: MetadataSchema,
  [T_STORE_PRODUCTS]: MetadataSchema,
  [T_STORE_B2B]: MetadataSchema,
  [T_STORE_B2B_PRODUCTS]: MetadataSchema,
  [T_STORE_ACCOUNT]: MetadataSchema,
  [T_STORE_ACCOUNT_ORDERS]: MetadataSchema,
  [T_STORE_ACCOUNT_ADDRESSES]: MetadataSchema,
  [T_STORE_ACCOUNT_RATINGS]: MetadataSchema,
  [T_STORE_HELP]: MetadataSchema,
  [T_STORE_FAQ]: MetadataSchema,
  [T_STORE_REASONS_FOR_REJECTIONS]: MetadataSchema,
  [T_STORE_PRIVACY_POLICY]: MetadataSchema,
  [T_STORE_REGULATIONS]: MetadataSchema,
  [T_STORE_GENERAL_CONDITIONS_OF_SALE]: MetadataSchema,
  [T_STORE_CONTACT]: MetadataSchema,
  [T_STORE_COOPERATION]: MetadataSchema,
  [T_STORE_ABOUT_US]: MetadataSchema,
  [T_STORE_CART]: MetadataSchema,
  [T_STORE_CHECKOUT]: MetadataSchema,
  [T_ACCOUNT_SETTINGS]: MetadataSchema,
  [T_AUTH_LOGIN]: MetadataSchema,
  [T_AUTH_REGISTER]: MetadataSchema,
  [T_AUTH_FORGOT]: MetadataSchema,
});

const PageContentSchema = object()
  .shape({
    content: array()
      .of(
        object<dbPageContentUpdate>({
          value: string().required(),
        }),
      )
      .required(),
  })
  .required();

export type PageContentRecord = Record<string, dbPageContentUpdate>;

export const StorePageContentSchema = object<PageContentRecord>({
  [T_STORE_HELP]: PageContentSchema,
  [T_STORE_FAQ]: PageContentSchema,
  [T_STORE_REASONS_FOR_REJECTIONS]: PageContentSchema,
  [T_STORE_PRIVACY_POLICY]: PageContentSchema,
  [T_STORE_REGULATIONS]: PageContentSchema,
  [T_STORE_GENERAL_CONDITIONS_OF_SALE]: PageContentSchema,
  [T_STORE_CONTACT]: PageContentSchema,
  [T_STORE_COOPERATION]: PageContentSchema,
  [T_STORE_ABOUT_US]: PageContentSchema,
});

export const StoreOrderSchema: ObjectSchema<StoreOrderForm> = object().shape({
  contact: StoreContactSchema,
  email: ref<string>("contact.email"),
  anonymousPackageShipping: boolean().defined().default(false),
  anonymousPackageLabelAddress: AnonymousPackageLabelAddressSchema,
  invoice: boolean().defined(),
  billing: object()
    .shape({
      name: string().ensure().default(""),
      type: string<AddressTypeEnum>()
        .required()
        .default(AddressTypeEnum.BILLING),
      nip: string().required().default(""),
      companyName: string().required().default(""),
      ...InvoiceRecipientSchemaFields,
      street: string().required().default(""),
      number: string().ensure().default(""),
      local: string().ensure().default(""),
      zip: string().required().default(""),
      city: string().required().default(""),
      country: string().required().default("Polska"),
      active: boolean().defined().default(true),
    })
    .when("invoice", ([invoice], schema) => {
      return invoice
        ? schema.required()
        : schema.notRequired().transform(() => null);
    }),
  saveBillingAddress: boolean().defined().default(false),
  shipping: object().shape({
    name: string().ensure().default(""),
    type: string<AddressTypeEnum>()
      .required()
      .default(AddressTypeEnum.SHIPPING),
    nip: string().ensure().default(""),
    companyName: string().ensure().default(""),
    ...InvoiceRecipientSchemaFields,
    street: string().required().default(""),
    number: string().ensure().default(""),
    local: string().ensure().default(""),
    zip: string().required().default(""),
    city: string().required().default(""),
    country: string().required().default("Polska"),
    active: boolean().defined().default(true),
  }),
  saveShippingAddress: boolean().defined().default(false),
  designatedPickupAreaId: string().optional(),
  proofing: string<ProofingOptions>().required(),
  specialNotes: string().ensure().max(500),
  invoiceNotes: string().ensure().max(3500),
  appliedPromotionCodes: array().of(string().required()).required(),
  storeCreditAmount: number().min(0).integer().optional().default(0),
  sendStatusChangeEmail: boolean().defined().default(false),
});

export const HeroCardSchema: ObjectSchema<HeroCard> = object().shape({
  title: string().ensure(),
  subtitle: string().ensure(),
  image: string().ensure(),
  buttonLabel: string().ensure(),
  buttonUrl: string().ensure(),
  buttonColor: string().ensure(),
  backgroundColor: string().ensure(),
  textColor: string().ensure(),
  active: boolean().defined(),
});

export const HeroCardTranslationSchema: ObjectSchema<HeroCardTranslation> =
  object().shape({
    title: string().ensure(),
    subtitle: string().ensure(),
    buttonUrl: string().ensure(),
    buttonLabel: string().ensure(),
  });

export const HeroSchema: ObjectSchema<Hero> = object().shape({
  cards: array().of(HeroCardSchema).required(),
});

const ApplicationMethodCreateSchema: ObjectSchema<
  Omit<CreateApplicationMethod, "promotion" | "targetRules" | "buyRules">
> = object().shape({
  type: string<ApplicationMethodTypeValues>().required(),
  targetType: string<ApplicationMethodTargetTypeValues>().required(),
  allocation: string<ApplicationMethodAllocationValues>(),
  value: number(),
  currencyCode: string(),
  maxQuantity: number().nullable(),
  buyRulesMinQuantity: number().nullable(),
  applyToQuantity: number().nullable(),
});

const PromotionRuleCreateSchema: ObjectSchema<CreatePromotionRule> =
  object().shape({
    description: string().nullable(),
    attribute: string<PromotionRuleAttributeValues>().required(),
    operator: string<PromotionRuleOperatorValues>().required(),
    values: array().of(string().required()).required(),
  });

const CreateCampaignBudgetSchema: ObjectSchema<CreateCampaignBudget> =
  object().shape({
    type: string<CampaignBudgetTypeValues>().when("campaign.createBudget", {
      is: true,
      then: (schema) => schema.required(),
      otherwise: (schema) => schema.notRequired().transform(() => null),
    }),
    limit: number().when("campaign.createBudget", {
      is: true,
      then: (schema) => schema.required(),
      otherwise: (schema) => schema.notRequired().transform(() => null),
    }),
    used: number(),
    currencyCode: string(),
  });

export const CampaignCreateSchema: ObjectSchema<
  Omit<CreateCampaign, "createdAt" | "updatedAt">
> = object().shape({
  name: string().defined().default(""),
  description: string().nullable(),
  campaignIdentifier: string().defined().default(""),
  startsAt: string(),
  endsAt: string(),
  availabilityTypes: array().of(
    string<CampaignAvailabilityTypeEnum>().ensure(),
  ),
  budget: CreateCampaignBudgetSchema,
});

export const CampaignUpdateSchema: ObjectSchema<
  Omit<UpdateCampaign, "updatedAt">
> = object().shape({
  id: string().required(),
  name: string().required(),
  description: string().nullable(),
  campaignIdentifier: string().required(),
  startsAt: string(),
  endsAt: string(),
  availabilityTypes: array().of(
    string<CampaignAvailabilityTypeEnum>().ensure(),
  ),
  budget: CreateCampaignBudgetSchema,
});

export const PromotionCreateSchema: ObjectSchema<
  Omit<CreatePromotion, "createdAt" | "updatedAt">
> = object().shape({
  code: string().required(),
  type: string<PromotionTypeValues>().required(),
  isAutomatic: boolean(),
  isOneTime: boolean(),
  minimumOrderValue: number().nullable().min(0),
  applicationMethod: ApplicationMethodCreateSchema,
  rules: array().of(PromotionRuleCreateSchema).required(),
  campaign: CampaignCreateSchema,
  campaignId: string(),
  active: boolean().defined().default(true),
});

const UpdateApplicationMethodSchema: ObjectSchema<UpdateApplicationMethod> =
  object().shape({
    id: string(),
    type: string<ApplicationMethodTypeValues>(),
    targetType: string<ApplicationMethodTargetTypeValues>(),
    allocation: string<ApplicationMethodAllocationValues>(),
    value: number(),
    currencyCode: string(),
    maxQuantity: number().nullable(),
    buyRulesMinQuantity: number().nullable(),
    applyToQuantity: number().nullable(),
    promotion: string(),
  });

export const PromotionUpdateSchema: ObjectSchema<
  Omit<UpdatePromotion, "updatedAt">
> = object().shape({
  id: string().required(),
  isAutomatic: boolean(),
  isOneTime: boolean(),
  minimumOrderValue: number().nullable().min(0),
  code: string(),
  type: string<PromotionTypeValues>(),
  applicationMethod: UpdateApplicationMethodSchema.omit(["id"]),
  rules: array().of(PromotionRuleCreateSchema),
  campaignId: string(),
  active: boolean().defined().default(true),
});

export const B2BInquiryCreateSchema: ObjectSchema<
  Omit<
    CreateB2BInquiry,
    | "id"
    | "userId"
    | "createdBy"
    | "createdAt"
    | "updatedBy"
    | "updatedAt"
    | "active"
    | "status"
    | "customerId"
    | "contactOwner"
    | "notificationEmailLastError"
    | "notificationEmailSentAt"
    | "acceptedAt"
    | "rejectedAt"
    | "acceptanceEmailSentAt"
    | "reviewedBy"
    | "rejectionReason"
  >
> = object().shape({
  businessDescription: string().required().min(150).max(500),
  billing: AddressSchema,
});

export const ImposeSchema: ObjectSchema<Impose> = object().shape({
  customSheetSize: boolean().defined().default(false),
  sheetSizeName: string().defined().default(""),
  customSheetSizeWidth: number(),
  customSheetSizeHeight: number(),
  automaticSheetOrientation: boolean().defined().default(true),
  sheetOrientation: string().required().oneOf(Object.values(paperOrientation)),
  customItemSize: boolean().defined().default(false),
  itemSizeName: string().defined().default(""),
  customItemSizeWidth: number(),
  customItemSizeHeight: number(),
  automaticItemOrientation: boolean().defined().default(true),
  itemOrientation: string().required().oneOf(Object.values(paperOrientation)),
  automaticNumberOfHorizontalItems: boolean().defined().default(true),
  numItemsHorizontal: number(),
  automaticNumberOfVerticalItems: boolean().defined().default(true),
  numItemsVertical: number(),
  automaticSpacingHorizontal: boolean().defined().default(true),
  spacingHorizontal: string(),
  automaticSpacingVertical: boolean().defined().default(true),
  spacingVertical: string(),
  bleed: number().required(),
  bleedType: string().required().oneOf(Object.values(bleedType)),
  sourceSizing: string().oneOf(Object.values(sourceSizing)),
  cropMarks: boolean().defined().default(true),
  layout: string()
    .required()
    .oneOf(Object.values(layoutType))
    .default(layoutType.STEP_AND_REPEAT),
  pagesPerSignature: number().when("layout", {
    is: layoutType.BOOKLET,
    then: (schema) =>
      schema
        .required()
        .integer("Liczba stron w składce musi być wielokrotnością 4")
        .positive()
        .test(
          "pagesPerSignatureMultipleOfFour",
          "Liczba stron w składce musi być wielokrotnością 4",
          (value) => value == null || value % 4 === 0,
        ),
    otherwise: (schema) => schema.notRequired(),
  }),
  bindingEdge: string()
    .oneOf(Object.values(bindingEdge))
    .when("layout", {
      is: layoutType.BOOKLET,
      then: (schema) => schema.required(),
      otherwise: (schema) => schema.notRequired(),
    }),
  duplexMode: string().oneOf(Object.values(duplexMode)),
  backPageRotation: string().oneOf(Object.values(backPageRotation)),
  frontBackAlignment: boolean().defined().default(false),
  mirrorBack: boolean().defined().default(false),
  files: mixed<File[]>()
    .required("Brak pliku")
    .test(
      "fileCount",
      `Maksymalnie ${IMPOSITION_MAX_FILES} plików`,
      (value) =>
        value && Array.isArray(value) && value.length <= IMPOSITION_MAX_FILES,
    )
    .test(
      "fileSize",
      `Maksymalny rozmiar pojedynczego pliku to ${IMPOSITION_MAX_FILE_SIZE_MB} MB`,
      (value) =>
        value &&
        Array.isArray(value) &&
        value.every((file) => file.size <= IMPOSITION_MAX_FILE_SIZE_BYTES),
    )
    .test(
      "totalFileSize",
      `Łączny rozmiar plików nie może przekroczyć ${IMPOSITION_MAX_TOTAL_FILE_SIZE_MB} MB`,
      (value) =>
        value &&
        Array.isArray(value) &&
        value.reduce((totalSize, file) => totalSize + file.size, 0) <=
          IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
    )
    .test(
      "fileType",
      "Nieobsługiwany format pliku",
      (value) =>
        value &&
        Array.isArray(value) &&
        value.every((file) =>
          IMPOSITION_SUPPORTED_FILE_TYPES.includes(
            file.type as (typeof IMPOSITION_SUPPORTED_FILE_TYPES)[number],
          ),
        ),
    ),
  saveAsTemplate: boolean().defined().default(false),
  templateName: string().ensure(),
});

export const ComplaintCreateSchema: ObjectSchema<ComplaintCreateForm> =
  object().shape({
    orderItemIds: array().of(string().required()).required(),
    description: string().required(),
    status: string<ComplaintStatus>().required(),
    createdBy: NestedMemberSchema,
    carriedOutBy: array().of(string().required()).required().ensure(),
    active: boolean().defined().default(true),
  });

export const ComplaintUpdateSchema: ObjectSchema<ComplaintUpdateForm> =
  object().shape({
    orderItemIds: array().of(string().required()).required(),
    description: string().required(),
    status: string<ComplaintStatus>().required(),
    updatedBy: NestedMemberSchema,
    carriedOutBy: array().of(string().required()).required().ensure(),
  });

export const OrderCreateSchema: ObjectSchema<OrderCreateForm> = object().shape({
  customer: lazy((value) => {
    switch (typeof value) {
      case "string":
        return string().required();
      case "object":
        return NestedCustomerSchema.required();
      default:
        return string().required();
    }
  }),
  contact: ContactSchema,
  email: string().email(),
  externalSource: ExternalOrderSourceSchema,
  anonymousPackageShipping: boolean().defined().default(false),
  anonymousPackageLabelAddress: AnonymousPackageLabelAddressSchema,
  invoice: boolean().defined(),
  items: OrderItemsStrictSchema.required(),
  shippingOption: string<ShippingOptions>().required(),
  shipping: OrderShippingSchema,
  designatedPickupAreaId: string().optional(),
  billing: AddressSchema.when("invoice", ([invoice], schema) => {
    return invoice
      ? schema.required()
      : schema.nullable().transform(() => null);
  }).nullable(),
  exactTime: boolean().defined().default(false),
  deadlineString: string().required(),
  specialNotes: string().ensure().max(500),
  invoiceNotes: string().ensure().max(3500),
  mailLink: string().ensure().max(500),
  status: string<OrderStatus>().required(),
  paymentType: string<PaymentType>().required(),
  paymentStatus: string<PaymentStatus>().required(),
  filesStatus: string<OrderFilesStatus>().required(),
  difficulty: number().required(),
  priority: number().required(),
  isTest: boolean().defined(),
  createdBy: NestedMemberSchema,
  toChannel: ToChannelSchema,
  appliedPromotionCodes: array().of(string().required()).required(),
  paymentDocumentId: string().ensure(),
  proformaDocumentId: string().ensure(),
  printingMethods: array()
    .of(string<PrintingMethodId>().required())
    .ensure()
    .min(1, "Pole jest wymagane."),
  carriedOutBy: array().of(string().required()).required().ensure(),
  saveCustomer: boolean().defined().default(false),
  saveContact: boolean().defined().default(false),
  sendStatusChangeEmail: boolean().defined().default(false),
  saveShippingAddress: boolean().defined().default(false),
  saveBillingAddress: boolean().defined().default(false),
  active: boolean().defined().default(true),
});

export const AdminQuickOrderCreateSchema: ObjectSchema<OrderCreateForm> =
  OrderCreateSchema.shape({
    customer: lazy((value) => {
      switch (typeof value) {
        case "string":
          return string().ensure();
        case "object":
          return NestedCustomerSchema.required();
        default:
          return string().ensure();
      }
    }),
    contact: AdminQuickOrderContactSchema,
    shipping: AdminQuickOrderShippingSchema,
    printingMethods: array().of(string<PrintingMethodId>().required()).ensure(),
  });

export const OrderUpdateSchema: ObjectSchema<OrderUpdateForm> = object().shape({
  customer: lazy((value) => {
    switch (typeof value) {
      case "string":
        return string().required();
      case "object":
        return NestedCustomerSchema.required();
      default:
        return string().required();
    }
  }),
  contact: ContactSchema,
  email: string().email(),
  anonymousPackageShipping: boolean().defined().default(false),
  anonymousPackageLabelAddress: AnonymousPackageLabelAddressSchema,
  invoice: boolean().defined(),
  items: OrderItemsStrictSchema.required(),
  shippingOption: string<ShippingOptions>().required(),
  shipping: OrderShippingSchema,
  designatedPickupAreaId: string().optional(),
  billing: AddressSchema.when("invoice", ([invoice], schema) => {
    return invoice
      ? schema.required()
      : schema.nullable().transform(() => null);
  }).nullable(),
  exactTime: boolean().defined().default(false),
  deadlineString: string().required(),
  specialNotes: string().ensure().max(500),
  invoiceNotes: string().ensure().max(3500),
  mailLink: string().ensure().max(500),
  status: string<OrderStatus>().required(),
  paymentType: string<PaymentType>().required(),
  paymentStatus: string<PaymentStatus>().required(),
  filesStatus: string<OrderFilesStatus>().required(),
  difficulty: number().required(),
  priority: number().required(),
  updatedBy: NestedMemberSchema,
  isTest: boolean().defined(),
  appliedPromotionCodes: array().of(string().required()).required(),
  paymentDocumentId: string().ensure(),
  proformaDocumentId: string().ensure(),
  printingMethods: array().of(string<PrintingMethodId>().required()).ensure(),
  carriedOutBy: array().of(string().required()).required().ensure(),
  saveCustomer: boolean().defined().default(false),
  saveContact: boolean().defined().default(false),
  sendStatusChangeEmail: boolean().defined().default(false),
  saveShippingAddress: boolean().defined().default(false),
  saveBillingAddress: boolean().defined().default(false),
  active: boolean().defined().default(true),
});

export const OrderUpdateSchemaStore: ObjectSchema<OrderUpdateFormStore> =
  object().shape({
    anonymousPackageShipping: boolean().defined().default(false),
    anonymousPackageLabelAddress: AnonymousPackageLabelAddressSchema,
    shippingOption: string<ShippingOptions>().required(),
    shipping: OrderShippingSchema,
    designatedPickupAreaId: string().optional(),
    deadlineString: string().required(),
    specialNotes: string().ensure().max(500),
    invoiceNotes: string().ensure().max(3500),
    mailLink: string().ensure().max(500),
    status: string<OrderStatus>().required(),
    paymentStatus: string<PaymentStatus>().required(),
    filesStatus: string<OrderFilesStatus>().required(),
    priority: number().required(),
    updatedBy: NestedMemberSchema,
    paymentDocumentId: string().ensure(),
    proformaDocumentId: string().ensure(),
    printingMethods: array().of(string<PrintingMethodId>().required()).ensure(),
    carriedOutBy: array().of(string().required()).required().ensure(),
    active: boolean().defined().default(true),
    sendStatusChangeEmail: boolean().defined().default(false),
  });

export const NoteCreateSchema: ObjectSchema<NoteCreateForm> = object().shape({
  name: string(),
  content: string().required(),
  category: string<NoteCategory>().required(),
  priority: string<NotePriority>().required(),
  toChannel: ToChannelSchema,
  entityId: string().ensure(),
  entityType: string<NoteEntityType>().ensure(),
  dueDate: string().ensure(),
  completed: boolean().defined(),
  createdBy: NestedMemberSchema,
  carriedOutBy: array().of(string().required()).required().ensure(),
});

export const NoteUpdateSchema: ObjectSchema<NoteUpdateForm> = object().shape({
  name: string().ensure(),
  content: string().required(),
  category: string<NoteCategory>().required(),
  priority: string<NotePriority>().required(),
  toChannel: ToChannelSchema,
  entityId: string().ensure(),
  entityType: string<NoteEntityType>().ensure(),
  dueDate: string().ensure(),
  completed: boolean().defined(),
  updatedBy: NestedMemberSchema,
  carriedOutBy: array().of(string().required()).required().ensure(),
});

export const ProductTranslationCreateSchema: ObjectSchema<ProductTranslationCreateForm> =
  object().shape({
    name: string().ensure(),
    locale: string<Locale>().required(),
    description: string().ensure(),
    seo: object()
      .shape({
        title: string().ensure(),
        description: string().ensure(),
        slug: string().ensure(),
      })
      .optional(),
    specialNotes: string().ensure().max(500),
    active: boolean().defined().default(true),
    createdBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const ProductTranslationUpdateSchema: ObjectSchema<ProductTranslationUpdateForm> =
  object().shape({
    name: string().ensure(),
    locale: string<Locale>().required(),
    description: string().ensure(),
    seo: object()
      .shape({
        title: string().ensure(),
        description: string().ensure(),
        slug: string().ensure(),
      })
      .optional(),
    specialNotes: string().ensure().max(500),
    active: boolean().defined().default(true),
    updatedBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const CategoryTranslationCreateSchema: ObjectSchema<CategoryTranslationCreateForm> =
  object().shape({
    name: string().ensure(),
    locale: string<Locale>().required(),
    description: string().ensure(),
    seo: object()
      .shape({
        title: string().ensure(),
        description: string().ensure(),
        slug: string().ensure(),
      })
      .optional(),
    active: boolean().defined().default(true),
    createdBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const CategoryTranslationUpdateSchema: ObjectSchema<CategoryTranslationUpdateForm> =
  object().shape({
    name: string().ensure(),
    locale: string<Locale>().required(),
    description: string().ensure(),
    seo: object()
      .shape({
        title: string().ensure(),
        description: string().ensure(),
        slug: string().ensure(),
      })
      .optional(),
    active: boolean().defined().default(true),
    updatedBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const HeroTranslationCreateSchema: ObjectSchema<HeroTranslationCreateForm> =
  object().shape({
    locale: string<Locale>().required(),
    cards: array().of(HeroCardTranslationSchema).required(),
    active: boolean().defined().default(true),
    createdBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const HeroTranslationUpdateSchema: ObjectSchema<HeroTranslationUpdateForm> =
  object().shape({
    locale: string<Locale>().required(),
    cards: array().of(HeroCardTranslationSchema).required(),
    active: boolean().defined().default(true),
    updatedBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

// Blog Translation Schemas
export const BlogPostTranslationCreateSchema: ObjectSchema<BlogPostTranslationCreateForm> =
  object().shape({
    locale: string<Locale>().required(),
    title: string().required(),
    excerpt: string().required(),
    content: string().required(),
    seo: object()
      .shape({
        title: string().required(),
        description: string().required(),
      })
      .required(),
    active: boolean().defined().default(true),
    createdBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const BlogPostTranslationUpdateSchema: ObjectSchema<BlogPostTranslationUpdateForm> =
  object().shape({
    locale: string<Locale>().required(),
    title: string().required(),
    excerpt: string().required(),
    content: string().required(),
    seo: object()
      .shape({
        title: string().required(),
        description: string().required(),
      })
      .required(),
    active: boolean().defined().default(true),
    updatedBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const BlogCategoryTranslationCreateSchema: ObjectSchema<BlogCategoryTranslationCreateForm> =
  object().shape({
    locale: string<Locale>().required(),
    name: string().required(),
    description: string().optional(),
    seo: object()
      .shape({
        title: string().required(),
        description: string().required(),
      })
      .required(),
    active: boolean().defined().default(true),
    createdBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const BlogCategoryTranslationUpdateSchema: ObjectSchema<BlogCategoryTranslationUpdateForm> =
  object().shape({
    locale: string<Locale>().required(),
    name: string().required(),
    description: string().optional(),
    seo: object()
      .shape({
        title: string().required(),
        description: string().required(),
      })
      .required(),
    active: boolean().defined().default(true),
    updatedBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const BlogTagTranslationCreateSchema: ObjectSchema<BlogTagTranslationCreateForm> =
  object().shape({
    locale: string<Locale>().required(),
    name: string().required(),
    description: string().optional(),
    active: boolean().defined().default(true),
    createdBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const BlogTagTranslationUpdateSchema: ObjectSchema<BlogTagTranslationUpdateForm> =
  object().shape({
    locale: string<Locale>().required(),
    name: string().required(),
    description: string().optional(),
    active: boolean().defined().default(true),
    updatedBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

const PageContentTranslationSchema = object()
  .shape({
    content: array()
      .of(
        object<StorePageContentTranslationUpdate>({
          value: string().required(),
        }),
      )
      .required(),
    translationMeta: TranslationMetaSchema,
  })
  .required();

export type StorePageContentTranslationRecord = Record<
  string,
  StorePageContentTranslationUpdate
>;

export const StorePageContentTranslationSchema =
  object<StorePageContentTranslationRecord>({
    [T_STORE_HELP]: PageContentTranslationSchema,
    [T_STORE_FAQ]: PageContentTranslationSchema,
    [T_STORE_REASONS_FOR_REJECTIONS]: PageContentTranslationSchema,
    [T_STORE_PRIVACY_POLICY]: PageContentTranslationSchema,
    [T_STORE_REGULATIONS]: PageContentTranslationSchema,
    [T_STORE_GENERAL_CONDITIONS_OF_SALE]: PageContentTranslationSchema,
    [T_STORE_CONTACT]: PageContentTranslationSchema,
    [T_STORE_COOPERATION]: PageContentTranslationSchema,
    [T_STORE_ABOUT_US]: PageContentTranslationSchema,
  });

const MetadataTranslationSchema = object()
  .shape({
    locale: string().required(),
    title: string().required(),
    description: string().required(),
    keywords: string().required(),
    ogTitle: string().optional(),
    ogDescription: string().optional(),
    ogImage: string().optional(),
    active: boolean().defined().default(true),
    translationMeta: TranslationMetaSchema,
  })
  .required();

export type StoreMetadataTranslationRecord = Record<
  string,
  StoreMetadataTranslationUpdateForm
>;

export const StoreMetadataTranslationSchema =
  object<StoreMetadataTranslationRecord>({
    [T_STORE_MAIN_LAYOUT]: MetadataTranslationSchema,
    [T_STORE_HOME]: MetadataTranslationSchema,
    [T_STORE_PRODUCTS]: MetadataTranslationSchema,
    [T_STORE_B2B]: MetadataTranslationSchema,
    [T_STORE_B2B_PRODUCTS]: MetadataTranslationSchema,
    [T_STORE_ACCOUNT]: MetadataTranslationSchema,
    [T_STORE_ACCOUNT_ORDERS]: MetadataTranslationSchema,
    [T_STORE_ACCOUNT_ADDRESSES]: MetadataTranslationSchema,
    [T_STORE_ACCOUNT_RATINGS]: MetadataTranslationSchema,
    [T_STORE_HELP]: MetadataTranslationSchema,
    [T_STORE_FAQ]: MetadataTranslationSchema,
    [T_STORE_REASONS_FOR_REJECTIONS]: MetadataTranslationSchema,
    [T_STORE_PRIVACY_POLICY]: MetadataTranslationSchema,
    [T_STORE_REGULATIONS]: MetadataTranslationSchema,
    [T_STORE_GENERAL_CONDITIONS_OF_SALE]: MetadataTranslationSchema,
    [T_STORE_CONTACT]: MetadataTranslationSchema,
    [T_STORE_COOPERATION]: MetadataTranslationSchema,
    [T_STORE_ABOUT_US]: MetadataTranslationSchema,
    [T_STORE_CART]: MetadataTranslationSchema,
    [T_STORE_CHECKOUT]: MetadataTranslationSchema,
    [T_ACCOUNT_SETTINGS]: MetadataTranslationSchema,
    [T_AUTH_LOGIN]: MetadataTranslationSchema,
    [T_AUTH_REGISTER]: MetadataTranslationSchema,
    [T_AUTH_FORGOT]: MetadataTranslationSchema,
  });

const AttributeOptionTranslationSchema: ObjectSchema<OptionTranslation> =
  object().shape({
    value: string().optional(),
    label: string().required(),
    advancedPreset: AdvancedPresetSchema,
  });

export const AttributeTranslationCreateSchema: ObjectSchema<AttributeTranslationCreateForm> =
  object().shape({
    name: string().ensure(),
    locale: string<Locale>().required(),
    options: array().of(AttributeOptionTranslationSchema).required(),
    active: boolean().defined().default(true),
    createdBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

export const AttributeTranslationUpdateSchema: ObjectSchema<AttributeTranslationUpdateForm> =
  object().shape({
    name: string().ensure(),
    locale: string<Locale>().required(),
    options: array().of(AttributeOptionTranslationSchema).required(),
    active: boolean().defined().default(true),
    updatedBy: NestedMemberSchema,
    translationMeta: TranslationMetaSchema,
  });

// Blog Schemas - Using simplified types to avoid Timestamp issues
const BlogSeoSchema = object().shape({
  title: string().required(),
  description: string().required(),
});

// Blog Post Forms
export const BlogPostCreateSchema = object().shape({
  name: string().required().max(200),
  slug: string()
    .required()
    .matches(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    ),
  title: string().required().max(200),
  excerpt: string().required().max(500),
  content: string().required(),
  featuredImage: string().ensure(),
  status: string<BlogPostStatus>().required(),
  categories: array().of(string().required()).required(),
  tags: array().of(string().required()).required(),
  seo: BlogSeoSchema,
  active: boolean().defined().default(true),
  createdBy: NestedMemberSchema,
  updatedBy: NestedMemberSchema,
});

export const BlogCategoryCreateSchema = object().shape({
  name: string().required().max(100),
  slug: string()
    .required()
    .matches(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    ),
  description: string().ensure().max(500),
  seo: object()
    .shape({
      title: string().required(),
      description: string().required(),
    })
    .required(),
  active: boolean().defined().default(true),
  createdBy: NestedMemberSchema,
  updatedBy: NestedMemberSchema,
});

export const BlogTagCreateSchema = object().shape({
  name: string().required().max(50),
  slug: string()
    .required()
    .matches(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    ),
  description: string().ensure().max(200),
  active: boolean().defined().default(true),
  createdBy: NestedMemberSchema,
  updatedBy: NestedMemberSchema,
});
