import {
  CurrencyEnum,
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
  PaymentType,
  PriceTypeEnum,
  ShippingOptions,
  ShippingTypes,
  Unit,
} from "@konfi/types";
import {
  CURRENCIES_SETTINGS_DOC_ID,
  createInitialCurrencySettings,
} from "@konfi/utils";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

type SeedDocument = Record<string, unknown>;

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-konfi-local";
const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  "demo-konfi-local.appspot.com";
const CHANNEL_ID = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID || "local-store";
const ADMIN_UID = "local-admin-user";
const CUSTOMER_UID = "local-customer-user";
const WAREHOUSE_ID = "local-main-warehouse";
const PRODUCT_TYPE_ID = "print-product";
const CATEGORY_ID = "marketing-materials";
const PRODUCT_ID = "standard-poster";
const CART_ITEM_ID = "cart-standard-poster";
const ORDER_ID = "local-order-1001";
const FIXED_DATE = Timestamp.fromDate(new Date("2026-01-01T10:00:00.000Z"));
const DEADLINE = Timestamp.fromDate(new Date("2026-01-05T15:00:00.000Z"));

const actor = {
  id: ADMIN_UID,
  name: "Local Admin",
};

const contact = {
  name: "Local Customer",
  email: "customer@local.konfi.dev",
  phone: "+48000000000",
  active: true,
};

const address = {
  name: "Local Customer Address",
  type: "SHIPPING",
  companyName: "Local Demo Studio",
  street: "Demo Street 1",
  zip: "00-001",
  city: "Warsaw",
  country: "PL",
  active: true,
};

const baseFields = {
  createdBy: actor,
  createdAt: FIXED_DATE,
  updatedBy: actor,
  updatedAt: FIXED_DATE,
  active: true,
};

function ensureLocalEmulatorTarget(): void {
  const hasEmulatorHost =
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
    Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  const explicitlyAllowed =
    process.env.KONFI_ALLOW_NON_LOCAL_FIREBASE_SEED === "true";
  const looksLocal =
    PROJECT_ID.includes("demo") ||
    PROJECT_ID.includes("local") ||
    PROJECT_ID === "konfi-emulator";

  if (!hasEmulatorHost) {
    throw new Error(
      "Refusing to seed Firebase without FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST, and FIREBASE_STORAGE_EMULATOR_HOST.",
    );
  }

  if (!looksLocal && !explicitlyAllowed) {
    throw new Error(
      `Refusing to seed non-local Firebase project "${PROJECT_ID}". Set KONFI_ALLOW_NON_LOCAL_FIREBASE_SEED=true only for disposable projects.`,
    );
  }
}

function initializeFirebase(): void {
  if (getApps().length > 0) {
    return;
  }

  initializeApp({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  });
}

async function deleteCollection(
  collectionRef: CollectionReference<DocumentData>,
): Promise<void> {
  for (;;) {
    const snapshot = await collectionRef.limit(100).get();

    if (snapshot.empty) {
      return;
    }

    await Promise.all(snapshot.docs.map((doc) => deleteDocumentTree(doc.ref)));
  }
}

async function deleteDocumentTree(
  documentRef: DocumentReference<DocumentData>,
): Promise<void> {
  const subcollections = await documentRef.listCollections();

  for (const subcollection of subcollections) {
    await deleteCollection(subcollection);
  }

  await documentRef.delete();
}

async function resetFirestore(): Promise<void> {
  const db = getFirestore();
  const collections = [
    "agents",
    "attributes",
    "carts",
    "channels",
    "customers",
    "externalProducts",
    "externalProviders",
    "members",
    "notifications",
    "productTypes",
    "warehouses",
  ];

  for (const collectionName of collections) {
    await deleteCollection(db.collection(collectionName));
  }
}

async function upsertAuthUser(params: {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  customClaims?: Record<string, unknown>;
  reset: boolean;
}): Promise<void> {
  const auth = getAuth();

  if (params.reset) {
    await auth.deleteUser(params.uid).catch((error: unknown) => {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "";

      if (code !== "auth/user-not-found") {
        throw error;
      }
    });
  }

  await auth
    .getUser(params.uid)
    .then((user) =>
      auth.updateUser(user.uid, {
        email: params.email,
        password: params.password,
        displayName: params.displayName,
        emailVerified: true,
        disabled: false,
      }),
    )
    .catch((error: unknown) => {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "";

      if (code !== "auth/user-not-found") {
        throw error;
      }

      return auth.createUser({
        uid: params.uid,
        email: params.email,
        password: params.password,
        displayName: params.displayName,
        emailVerified: true,
        disabled: false,
      });
    });

  if (params.customClaims) {
    await auth.setCustomUserClaims(params.uid, params.customClaims);
  }
}

async function seedAuth(reset: boolean): Promise<void> {
  await upsertAuthUser({
    uid: ADMIN_UID,
    email: "admin@local.konfi.dev",
    password: "KonfiLocal123!",
    displayName: "Local Admin",
    customClaims: {
      admin: true,
      accessLevel: 9999,
      channelIds: [CHANNEL_ID],
    },
    reset,
  });
  await upsertAuthUser({
    uid: CUSTOMER_UID,
    email: "customer@local.konfi.dev",
    password: "KonfiLocal123!",
    displayName: "Local Customer",
    customClaims: {
      customer: true,
    },
    reset,
  });
}

function getSeedDocuments(): Map<string, SeedDocument> {
  const price = {
    value: 49,
    threshold: 1,
    currency: CurrencyEnum.PLN,
    volume: {
      value: 1,
      deliveryTime: 2,
    },
  };
  const category = {
    id: CATEGORY_ID,
    name: "Marketing materials",
    ...baseFields,
    description: "Public-safe local demo category.",
    seo: {
      slug: "marketing-materials",
      title: "Marketing materials",
      description: "Posters and flyers for local development.",
    },
    keywords: ["marketing", "materials", "posters"],
  };
  const productType = {
    id: PRODUCT_TYPE_ID,
    name: "Print product",
    ...baseFields,
    attributes: ["format", "paper"],
    isShippable: true,
    keywords: ["print", "product"],
  };
  const nestedProductType = {
    id: PRODUCT_TYPE_ID,
    name: "Print product",
    attributes: ["format", "paper"],
    isShippable: true,
  };
  const nestedCategory = {
    id: CATEGORY_ID,
    name: "Marketing materials",
    active: true,
  };
  const product = {
    id: PRODUCT_ID,
    name: "Standard poster",
    ...baseFields,
    prices: [price],
    defaultPrice: price,
    lowPrice: price,
    highPrice: price,
    description: "Neutral local fixture for storefront and admin smoke flows.",
    volumes: [
      {
        value: 1,
        deliveryTime: 2,
      },
    ],
    attributes: ["format", "paper"],
    attributeOptions: {
      format: ["a2", "a3"],
      paper: ["silk-170", "matte-250"],
    },
    customSize: false,
    allowCustomPrice: false,
    recommended: true,
    difficulty: 1,
    shipping: {
      types: [ShippingTypes.COURIER, ShippingTypes.PERSONAL_COLLECTION],
    },
    spec: {
      images: ["placeholder.txt"],
      defaultOrder: 1,
      minimumOrder: 1,
      maximumOrder: 500,
      step: 1,
    },
    category: nestedCategory,
    seo: {
      slug: "standard-poster",
      title: "Standard poster",
      description: "Local demo poster.",
    },
    productType: nestedProductType,
    priceType: PriceTypeEnum.SINGLE,
    prefferedUnit: Unit.PCS,
    availability: {
      published: true,
      availableForPurchase: true,
      publication: null,
      expiration: null,
    },
    keywords: ["standard", "poster", "local"],
    linkedWarehouses: [WAREHOUSE_ID],
    channelId: CHANNEL_ID,
  };
  const nestedProduct = {
    id: PRODUCT_ID,
    name: "Standard poster",
    prices: [price],
    defaultPrice: price,
    lowPrice: price,
    highPrice: price,
    description: "Neutral local fixture for storefront and admin smoke flows.",
    volumes: [
      {
        value: 1,
        deliveryTime: 2,
      },
    ],
    attributes: ["format", "paper"],
    attributeOptions: {
      format: ["a2", "a3"],
      paper: ["silk-170", "matte-250"],
    },
    customSize: false,
    allowCustomPrice: false,
    recommended: true,
    difficulty: 1,
    shipping: {
      types: [ShippingTypes.COURIER, ShippingTypes.PERSONAL_COLLECTION],
    },
    spec: {
      images: ["placeholder.txt"],
      defaultOrder: 1,
      minimumOrder: 1,
      maximumOrder: 500,
      step: 1,
    },
    category: nestedCategory,
    productType: nestedProductType,
    priceType: PriceTypeEnum.SINGLE,
    prefferedUnit: Unit.PCS,
    linkedWarehouses: [WAREHOUSE_ID],
    channelId: CHANNEL_ID,
  };
  const orderItem = {
    id: CART_ITEM_ID,
    name: "Standard poster x10",
    description: "A2 poster on silk paper",
    product: nestedProduct,
    combination: "format:a2|paper:silk-170",
    calculatedCombination: null,
    volume: 1,
    customFormat: false,
    totalPrice: 490,
    customPrice: null,
    quantity: 10,
    discount: {
      type: "FIXED",
      discountValue: 0,
      discountedAmount: 0,
      code: null,
    },
    unit: Unit.PCS,
  };
  const customer = {
    id: CUSTOMER_UID,
    name: "Local Customer",
    ...baseFields,
    personName: "Local Customer",
    email: "customer@local.konfi.dev",
    allowedBankPayments: true,
    allowedOnPickupPayments: true,
    allowedDefferedPayments: false,
    contacts: [contact],
    addresses: [address],
    specialNotes: "Public-safe local fixture.",
    orders: [ORDER_ID],
    loyaltyPoints: 0,
    storeCreditBalance: 0,
    discount: 0,
    b2b: false,
    linkedProductsIds: [],
    keywords: ["local", "customer", "customer@local.konfi.dev"],
    linkedAuthId: CUSTOMER_UID,
  };

  return new Map<string, SeedDocument>([
    [
      `members/${ADMIN_UID}`,
      {
        id: ADMIN_UID,
        name: "Local Admin",
        email: "admin@local.konfi.dev",
        ...baseFields,
        channelIds: [CHANNEL_ID],
      },
    ],
    [
      `channels/${CHANNEL_ID}`,
      {
        id: CHANNEL_ID,
        name: "Local Store",
        ...baseFields,
        currency: CurrencyEnum.PLN,
        warehouses: [WAREHOUSE_ID],
      },
    ],
    [
      `channels/${CHANNEL_ID}/settings/buying`,
      {
        enabled: true,
        min: 1,
        max: 5000,
      },
    ],
    [
      `channels/${CHANNEL_ID}/settings/freeShipping`,
      {
        enabled: true,
        min: 250,
      },
    ],
    [
      `channels/${CHANNEL_ID}/settings/underConstruction`,
      {
        enabled: false,
        message: "",
      },
    ],
    [
      `channels/${CHANNEL_ID}/settings/express`,
      {
        enabled: true,
        percent: 25,
      },
    ],
    [
      `channels/${CHANNEL_ID}/settings/shippingOptionsPrices`,
      {
        [ShippingOptions.COMPANY_COURIER]: 19,
        [ShippingOptions.CUSTOM]: 0,
        [ShippingOptions.DHL]: 22,
        [ShippingOptions.DPD]: 21,
        [ShippingOptions.FEDEX]: 24,
        [ShippingOptions.INPOST]: 18,
        [ShippingOptions.PACZKOMATY_INPOST]: 15,
        [ShippingOptions.PERSONAL_COLLECTION]: 0,
      },
    ],
    [
      `channels/${CHANNEL_ID}/settings/${CURRENCIES_SETTINGS_DOC_ID}`,
      { ...createInitialCurrencySettings(CurrencyEnum.PLN, FIXED_DATE) },
    ],
    [
      "attributes/format",
      {
        id: "format",
        name: "Format",
        ...baseFields,
        calculated: false,
        required: true,
        format: true,
        options: [
          {
            label: "A2",
            value: "a2",
            customFormat: false,
            hidden: false,
            formatWidth: 420,
            formatHeight: 594,
          },
          {
            label: "A3",
            value: "a3",
            customFormat: false,
            hidden: false,
            formatWidth: 297,
            formatHeight: 420,
          },
        ],
        keywords: ["format", "a2", "a3"],
        type: "DROPDOWN",
        trackStock: false,
      },
    ],
    [
      "attributes/paper",
      {
        id: "paper",
        name: "Paper",
        ...baseFields,
        calculated: false,
        required: true,
        format: false,
        options: [
          {
            label: "Silk 170 g",
            value: "silk-170",
            customFormat: false,
            hidden: false,
          },
          {
            label: "Matte 250 g",
            value: "matte-250",
            customFormat: false,
            hidden: false,
          },
        ],
        keywords: ["paper", "silk", "matte"],
        type: "DROPDOWN",
        trackStock: false,
      },
    ],
    [`productTypes/${PRODUCT_TYPE_ID}`, productType],
    [`channels/${CHANNEL_ID}/categories/${CATEGORY_ID}`, category],
    [
      `warehouses/${WAREHOUSE_ID}`,
      {
        id: WAREHOUSE_ID,
        name: "Local Warehouse",
        ...baseFields,
        address,
        contacts: [contact],
        keywords: ["local", "warehouse"],
      },
    ],
    [`customers/${CUSTOMER_UID}`, customer],
    [`channels/${CHANNEL_ID}/products/${PRODUCT_ID}`, product],
    [
      `carts/${CUSTOMER_UID}`,
      {
        id: CUSTOMER_UID,
        lastReminderSentAt: null,
        updatedAt: FIXED_DATE,
      },
    ],
    [`carts/${CUSTOMER_UID}/items/${CART_ITEM_ID}`, orderItem],
    [
      `channels/${CHANNEL_ID}/orders/${ORDER_ID}`,
      {
        id: ORDER_ID,
        name: "Local order 1001",
        ...baseFields,
        number: 1001,
        customer,
        contact,
        email: "customer@local.konfi.dev",
        shipping: address,
        shippingOption: ShippingOptions.DPD,
        shippingPrice: 21,
        shippingPriceDiscount: null,
        invoice: false,
        billing: null,
        exactTime: false,
        deadlineString: "2026-01-05",
        deadline: DEADLINE,
        totalPrice: 511,
        totalPriceDiscount: null,
        currency: CurrencyEnum.PLN,
        specialNotes: "Public-safe local fixture order.",
        items: [orderItem],
        fulfilledItems: [],
        inProgressItems: [CART_ITEM_ID],
        priorityItems: [],
        difficulty: 1,
        priority: 1,
        status: OrderStatus.IN_PROGRESS,
        paymentType: PaymentType.BANK_TRANSFER,
        paymentStatus: PaymentStatus.PENDING,
        filesStatus: OrderFilesStatus.WAITING_FOR_FILES,
        activities: [],
        messages: [],
        keywords: ["local", "order", "1001", "customer@local.konfi.dev"],
        isFromStore: true,
        isTest: true,
        channelId: CHANNEL_ID,
        appliedPromotionCodes: [],
        carriedOutBy: [ADMIN_UID],
        complaints: [],
      },
    ],
  ]);
}

async function seedFirestore(): Promise<void> {
  const db = getFirestore();
  const documents = Array.from(getSeedDocuments().entries());

  for (let index = 0; index < documents.length; index += 500) {
    const batch = db.batch();
    const chunk = documents.slice(index, index + 500);

    for (const [path, document] of chunk) {
      batch.set(db.doc(path), document);
    }

    await batch.commit();
  }
}

async function seedStorage(reset: boolean): Promise<void> {
  const bucket = getStorage().bucket(STORAGE_BUCKET);

  if (reset) {
    await bucket.deleteFiles({ force: true }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("No such object")) {
        throw error;
      }
    });
  }

  await bucket
    .file(`channels/${CHANNEL_ID}/products/${PRODUCT_ID}/placeholder.txt`)
    .save("Konfi local emulator placeholder asset.\n", {
      contentType: "text/plain",
      resumable: false,
    });
}

async function validateSeed(): Promise<void> {
  const db = getFirestore();
  const requiredPaths = [
    `members/${ADMIN_UID}`,
    `channels/${CHANNEL_ID}`,
    `channels/${CHANNEL_ID}/settings/buying`,
    `channels/${CHANNEL_ID}/settings/${CURRENCIES_SETTINGS_DOC_ID}`,
    `customers/${CUSTOMER_UID}`,
    `channels/${CHANNEL_ID}/products/${PRODUCT_ID}`,
    `channels/${CHANNEL_ID}/orders/${ORDER_ID}`,
    `carts/${CUSTOMER_UID}/items/${CART_ITEM_ID}`,
  ];

  const snapshots = await db.getAll(
    ...requiredPaths.map((path) => db.doc(path)),
  );
  const missing = snapshots
    .filter((snapshot) => !snapshot.exists)
    .map((snapshot) => snapshot.ref.path);

  if (missing.length > 0) {
    throw new Error(`Seed validation failed. Missing: ${missing.join(", ")}`);
  }
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");

  ensureLocalEmulatorTarget();
  initializeFirebase();

  if (reset) {
    await resetFirestore();
  }

  await seedAuth(reset);
  await seedFirestore();
  await seedStorage(reset);
  await validateSeed();

  console.log(
    `Seeded Firebase emulators for project ${PROJECT_ID}. Admin: admin@local.konfi.dev / KonfiLocal123!, customer: customer@local.konfi.dev / KonfiLocal123!.`,
  );
}

main().catch((error: unknown) => {
  console.error("Firebase emulator seed failed:", error);
  process.exitCode = 1;
});
