// @vitest-environment node

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type TokenOptions,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "../../..");
const firestoreRules = readFileSync(
  path.join(repoRoot, "apps/functions/firestore.rules"),
  "utf8",
);
const storageRules = readFileSync(
  path.join(repoRoot, "apps/functions/storage.rules"),
  "utf8",
);

const PROJECT_ID = "demo-konfi-rules-test";
const BUCKET_URL = `gs://${PROJECT_ID}.appspot.com`;
const describeWithFirebaseEmulators =
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? describe
    : describe.skip;

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const defaultTenant = "default";
const tenantAAdminUid = "tenant-a-admin";
const tenantAChannelLimitedAdminUid = "tenant-a-channel-limited-admin";
const tenantAMemberUid = "tenant-a-member";
const tenantAOwnerUid = "tenant-a-owner";
const tenantAProductCreatorUid = "tenant-a-product-creator";
const tenantAOrderManagerUid = "tenant-a-order-manager";
const tenantBAdminUid = "tenant-b-admin";
const defaultAdminUid = "default-admin";
const dedicatedDefaultAdminUid = "dedicated-default-admin";
const superAdminUid = "super-admin";
const tenantACustomerUid = "tenant-a-customer";
const tenantBCustomerUid = "tenant-b-customer";

type TenantRole = "OWNER" | "ADMIN" | "MEMBER";

function adminToken(accessLevel: number): TokenOptions {
  return {
    admin: true,
    accessLevel,
    email_verified: true,
    firebase: {
      sign_in_provider: "password",
    },
  };
}

function membership(
  tenantId: string,
  uid: string,
  role: TenantRole,
  permissions?: string[],
  options: { channelIds?: string[] } = {},
) {
  return {
    id: `${tenantId}_${uid}`,
    tenantId,
    uid,
    role,
    accessLevel: 1,
    ...(options.channelIds ? { channelIds: options.channelIds } : {}),
    ...(permissions ? { permissionVersion: 1, permissions } : {}),
    status: "ACTIVE",
  };
}

function tenantOwnedDocument(tenantId: string) {
  return {
    id: `${tenantId}-warehouse`,
    name: `${tenantId} warehouse`,
    tenantId,
    active: true,
  };
}

function agentMemoryDocument(
  tenantId: string,
  status: "active" | "pending" = "active",
) {
  return {
    id: `${tenantId}-${status}-memory`,
    content: "Use matte stock for repeat quote requests.",
    createdBy: { id: "agent", kind: "agent", name: "quote agent" },
    scope: "tenant",
    scopeMetadata: {},
    status,
    taskTypes: ["quote"],
    tenantId,
    type: "preference",
    updatedBy: { id: "agent", kind: "agent", name: "quote agent" },
  };
}

function productTypeDocument(tenantId: string) {
  return {
    id: `${tenantId}-product-type`,
    name: `${tenantId} product type`,
    tenantId,
    active: true,
    attributes: [],
    isShippable: true,
  };
}

function attributeTranslationDocument(tenantId: string) {
  return {
    id: "en",
    name: `${tenantId} translation`,
    tenantId,
  };
}

function fcmTokenDocument(tenantId: string, uid: string) {
  return {
    id: uid,
    tenantId,
    tokens: [
      {
        timestamp: new Date(),
        value: `${tenantId}-${uid}-token`,
      },
    ],
    uid,
  };
}

function customerDocument(tenantId: string, uid: string) {
  return {
    active: true,
    id: uid,
    name: uid,
    tenantId,
  };
}

function customerGroupDocument(tenantId: string) {
  return {
    active: true,
    createdAt: new Date(),
    createdBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
    customerIds: [],
    id: `${tenantId}-group`,
    name: `${tenantId} group`,
    tenantId,
    updatedAt: new Date(),
    updatedBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
  };
}

function priceListDocument(tenantId: string) {
  return {
    active: true,
    createdAt: new Date(),
    createdBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
    currency: "PLN",
    entries: [],
    id: `${tenantId}-price-list`,
    name: `${tenantId} price list`,
    priority: 0,
    tenantId,
    updatedAt: new Date(),
    updatedBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
  };
}

function fakturowniaCostEvidenceDocument(tenantId: string) {
  return {
    active: true,
    createdAt: new Date(),
    createdBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
    currency: "PLN",
    id: `${tenantId}-cost-evidence`,
    invoice: {
      id: `${tenantId}-invoice`,
      issueDate: "2026-01-15",
      number: `${tenantId}/1/2026`,
    },
    name: `${tenantId} cost evidence`,
    normalizedText: `${tenantId} paper`,
    position: {
      index: 0,
      name: "Paper",
    },
    quantity: 100,
    source: "fakturownia",
    supplier: {
      name: `${tenantId} supplier`,
    },
    tenantId,
    totalPriceNet: 100,
    unitCostNet: 1,
    updatedAt: new Date(),
    updatedBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
  };
}

function fakturowniaCostMappingDocument(tenantId: string) {
  return {
    active: true,
    aliases: ["Paper"],
    confidence: 0.9,
    createdAt: new Date(),
    createdBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
    evidenceId: `${tenantId}-cost-evidence`,
    id: `${tenantId}-cost-mapping`,
    name: `${tenantId} cost mapping`,
    productId: `${tenantId}-product`,
    sourceSignals: ["supplier_linked_product"],
    status: "approved",
    tenantId,
    updatedAt: new Date(),
    updatedBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
  };
}

function storeCreditTransactionDocument(tenantId: string, customerId: string) {
  return {
    active: true,
    amount: 1000,
    balanceAfter: 1000,
    createdAt: new Date(),
    createdBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
    currency: "PLN",
    customerId,
    id: `${tenantId}-store-credit`,
    name: `${tenantId} store credit`,
    reason: "Manual adjustment",
    tenantId,
    type: "ISSUE",
    updatedAt: new Date(),
    updatedBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
  };
}

function rmaRequestDocument(tenantId: string, customerId: string) {
  return {
    active: true,
    channelId: `${tenantId}-channel`,
    createdAt: new Date(),
    createdBy: { id: customerId, name: customerId },
    currency: "PLN",
    customerId,
    id: `${tenantId}-rma`,
    items: [{ orderItemId: "item-1", quantity: 1 }],
    orderId: `${tenantId}-order`,
    status: "NEW",
    tenantId,
    type: "CLAIM",
    updatedAt: new Date(),
    updatedBy: { id: customerId, name: customerId },
  };
}

function channelDocument(tenantId: string) {
  return {
    active: true,
    id: `${tenantId}-channel`,
    name: `${tenantId} channel`,
    tenantId,
  };
}

function orderDocument(tenantId: string, customerId: string) {
  return {
    active: true,
    createdAt: new Date(),
    createdBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
    customer: { id: customerId, name: customerId },
    id: `${tenantId}-order`,
    number: 1,
    status: "NEW",
    tenantId,
    updatedAt: new Date(),
    updatedBy: { id: `${tenantId}-admin`, name: `${tenantId} admin` },
  };
}

function impositionSuggestionDocument(tenantId?: string) {
  return {
    createdAt: new Date(),
    inputHash: "hash-1",
    suggestions: [{ orderItemId: "item-1", workflowIds: ["workflow-1"] }],
    ...(tenantId ? { tenantId } : {}),
  };
}

function channelProductDocument(tenantId: string, productId: string) {
  return {
    ...tenantOwnedDocument(tenantId),
    availability: {
      published: true,
    },
    id: productId,
  };
}

function aiInstructionsDocument(tenantId: string) {
  return {
    capabilities: {
      adminAssistant: {
        enabled: true,
        instructions: "Use concise operational language.",
      },
      printMethodResolution: {
        enabled: true,
        instructions: "Prefer UV for rigid boards.",
      },
      storefrontAssistant: {
        enabled: false,
        instructions: "",
      },
    },
    tenantId,
  };
}

async function seedFirestore(testEnv: RulesTestEnvironment) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await Promise.all([
      db
        .doc(`tenantMemberships/${tenantA}_${tenantAAdminUid}`)
        .set(membership(tenantA, tenantAAdminUid, "ADMIN")),
      db
        .doc(`tenantMemberships/${tenantA}_${tenantAChannelLimitedAdminUid}`)
        .set(
          membership(
            tenantA,
            tenantAChannelLimitedAdminUid,
            "ADMIN",
            ["orders.manage", "configuration.settings.manage"],
            { channelIds: [`${tenantA}-channel`] },
          ),
        ),
      db
        .doc(`tenantMemberships/${tenantA}_${tenantAOwnerUid}`)
        .set(membership(tenantA, tenantAOwnerUid, "OWNER")),
      db
        .doc(`tenantMemberships/${tenantA}_${tenantAProductCreatorUid}`)
        .set(
          membership(tenantA, tenantAProductCreatorUid, "ADMIN", [
            "catalog.products.create",
          ]),
        ),
      db
        .doc(`tenantMemberships/${tenantA}_${tenantAOrderManagerUid}`)
        .set(
          membership(tenantA, tenantAOrderManagerUid, "ADMIN", [
            "orders.manage",
          ]),
        ),
      db
        .doc(`tenantMemberships/${tenantA}_${tenantAMemberUid}`)
        .set(membership(tenantA, tenantAMemberUid, "MEMBER")),
      db
        .doc(`tenantMemberships/${tenantB}_${tenantBAdminUid}`)
        .set(membership(tenantB, tenantBAdminUid, "ADMIN")),
      db
        .doc(`tenantMemberships/${defaultTenant}_${defaultAdminUid}`)
        .set(membership(defaultTenant, defaultAdminUid, "ADMIN")),
      db.doc("warehouses/tenant-a-warehouse").set(tenantOwnedDocument(tenantA)),
      db.doc("warehouses/tenant-b-warehouse").set(tenantOwnedDocument(tenantB)),
      db
        .doc("agentMemories/tenant-a-active-memory")
        .set(agentMemoryDocument(tenantA)),
      db
        .doc("agentMemories/tenant-a-pending-memory")
        .set(agentMemoryDocument(tenantA, "pending")),
      db
        .doc("agentMemories/tenant-b-active-memory")
        .set(agentMemoryDocument(tenantB)),
      db
        .doc("productTypes/tenant-a-product-type")
        .set(productTypeDocument(tenantA)),
      db
        .doc("productTypes/tenant-b-product-type")
        .set(productTypeDocument(tenantB)),
      db.doc("attributes/tenant-a-attribute").set({
        ...tenantOwnedDocument(tenantA),
        id: "tenant-a-attribute",
      }),
      db.doc("attributes/tenant-b-attribute").set({
        ...tenantOwnedDocument(tenantB),
        id: "tenant-b-attribute",
      }),
      db
        .doc("attributes/tenant-b-attribute/options/option-a/translations/en")
        .set(attributeTranslationDocument(tenantB)),
      db
        .doc(`fcmTokens/${tenantAAdminUid}`)
        .set(fcmTokenDocument(tenantA, tenantAAdminUid)),
      db
        .doc(`fcmTokens/${tenantBAdminUid}`)
        .set(fcmTokenDocument(tenantB, tenantBAdminUid)),
      db
        .doc(`customers/${tenantACustomerUid}`)
        .set(customerDocument(tenantA, tenantACustomerUid)),
      db
        .doc(`customers/${tenantBCustomerUid}`)
        .set(customerDocument(tenantB, tenantBCustomerUid)),
      db
        .doc(`customers/${defaultTenant}-customer`)
        .set(customerDocument(defaultTenant, `${defaultTenant}-customer`)),
      db.doc("customers/missing-tenant-customer").set({
        active: true,
        id: "missing-tenant-customer",
        name: "Missing tenant customer",
      }),
      db
        .doc(
          `customers/${tenantACustomerUid}/storeCreditTransactions/${tenantA}-store-credit`,
        )
        .set(storeCreditTransactionDocument(tenantA, tenantACustomerUid)),
      db
        .doc(
          `customers/${tenantBCustomerUid}/storeCreditTransactions/${tenantB}-store-credit`,
        )
        .set(storeCreditTransactionDocument(tenantB, tenantBCustomerUid)),
      db
        .doc(
          `customers/${defaultTenant}-customer/storeCreditTransactions/${defaultTenant}-store-credit`,
        )
        .set(
          storeCreditTransactionDocument(
            defaultTenant,
            `${defaultTenant}-customer`,
          ),
        ),
      db
        .doc(
          "customers/missing-tenant-customer/storeCreditTransactions/missing-tenant-store-credit",
        )
        .set({
          active: true,
          amount: 1000,
          balanceAfter: 1000,
          createdAt: new Date(),
          createdBy: { id: "legacy-admin", name: "Legacy admin" },
          currency: "PLN",
          customerId: "missing-tenant-customer",
          id: "missing-tenant-store-credit",
          name: "Missing tenant store credit",
          reason: "Manual adjustment",
          type: "ISSUE",
          updatedAt: new Date(),
          updatedBy: { id: "legacy-admin", name: "Legacy admin" },
        }),
      db
        .doc("customerGroups/tenant-a-group")
        .set(customerGroupDocument(tenantA)),
      db
        .doc("customerGroups/tenant-b-group")
        .set(customerGroupDocument(tenantB)),
      db.doc("priceLists/tenant-a-price-list").set(priceListDocument(tenantA)),
      db.doc("priceLists/tenant-b-price-list").set(priceListDocument(tenantB)),
      db
        .doc("fakturowniaCostEvidence/tenant-a-cost-evidence")
        .set(fakturowniaCostEvidenceDocument(tenantA)),
      db
        .doc("fakturowniaCostEvidence/tenant-b-cost-evidence")
        .set(fakturowniaCostEvidenceDocument(tenantB)),
      db
        .doc("fakturowniaCostMappings/tenant-a-cost-mapping")
        .set(fakturowniaCostMappingDocument(tenantA)),
      db
        .doc("fakturowniaCostMappings/tenant-b-cost-mapping")
        .set(fakturowniaCostMappingDocument(tenantB)),
      db.doc(`channels/${tenantA}-channel`).set(channelDocument(tenantA)),
      db.doc(`channels/${tenantA}-other-channel`).set({
        ...channelDocument(tenantA),
        id: `${tenantA}-other-channel`,
        name: `${tenantA} other channel`,
      }),
      db.doc(`channels/${tenantB}-channel`).set(channelDocument(tenantB)),
      db
        .doc(`channels/${tenantA}-channel/orders/${tenantA}-order`)
        .set(orderDocument(tenantA, tenantACustomerUid)),
      db
        .doc(`channels/${tenantA}-other-channel/orders/${tenantA}-other-order`)
        .set({
          ...orderDocument(tenantA, tenantACustomerUid),
          id: `${tenantA}-other-order`,
        }),
      db
        .doc(`channels/${tenantB}-channel/orders/${tenantB}-order`)
        .set(orderDocument(tenantB, tenantBCustomerUid)),
      db.doc("channels/default-channel").set(channelDocument(defaultTenant)),
      db
        .doc("channels/default-channel/orders/default-order")
        .set(orderDocument(defaultTenant, `${defaultTenant}-customer`)),
      db.doc("channels/legacy-channel").set({
        active: true,
        id: "legacy-channel",
        name: "Legacy channel",
      }),
      db.doc("channels/legacy-channel/orders/legacy-order").set({
        active: true,
        createdAt: new Date(),
        createdBy: { id: "legacy-admin", name: "Legacy admin" },
        customer: { id: "missing-tenant-customer", name: "Legacy customer" },
        id: "legacy-order",
        number: 2,
        status: "NEW",
        updatedAt: new Date(),
        updatedBy: { id: "legacy-admin", name: "Legacy admin" },
      }),
      db
        .doc(
          "channels/legacy-channel/orders/legacy-order/impositionTemplateSuggestions/latest",
        )
        .set(impositionSuggestionDocument()),
      db
        .doc(
          `channels/${tenantA}-channel/orders/${tenantA}-order/impositionTemplateSuggestions/latest`,
        )
        .set(impositionSuggestionDocument()),
      db
        .doc(`channels/${tenantA}-channel/products/${tenantA}-product`)
        .set(channelProductDocument(tenantA, `${tenantA}-product`)),
      db
        .doc(
          `channels/${tenantA}-channel/products/${tenantA}-product-without-config`,
        )
        .set(
          channelProductDocument(tenantA, `${tenantA}-product-without-config`),
        ),
      db
        .doc(`channels/${tenantB}-channel/products/${tenantB}-product`)
        .set(channelProductDocument(tenantB, `${tenantB}-product`)),
      db
        .doc(
          `channels/${tenantA}-channel/products/${tenantA}-product/imageGeneration/config`,
        )
        .set({
          enabled: true,
          promptEnhancement: "Prefer product photography lighting.",
        }),
      db
        .doc(`channels/${tenantA}-channel/settings/aiInstructions`)
        .set(aiInstructionsDocument(tenantA)),
      db.doc(`channels/${tenantA}-channel/settings/buying`).set({
        enabled: true,
        tenantId: tenantA,
      }),
      db
        .doc(`channels/${tenantA}-channel/rmaRequests/${tenantA}-rma`)
        .set(rmaRequestDocument(tenantA, tenantACustomerUid)),
      db
        .doc(`channels/${tenantB}-channel/rmaRequests/${tenantB}-rma`)
        .set(rmaRequestDocument(tenantB, tenantBCustomerUid)),
      db
        .doc("warehouses/default-warehouse")
        .set(tenantOwnedDocument(defaultTenant)),
      db
        .doc("customerGroups/default-group")
        .set(customerGroupDocument(defaultTenant)),
      db
        .doc("priceLists/default-price-list")
        .set(priceListDocument(defaultTenant)),
      db.doc("warehouses/missing-tenant-warehouse").set({
        id: "missing-tenant-warehouse",
        name: "Missing tenant warehouse",
        active: true,
      }),
      db.doc("customerGroups/missing-tenant-group").set({
        active: true,
        createdAt: new Date(),
        createdBy: { id: "legacy-admin", name: "Legacy admin" },
        customerIds: [],
        id: "missing-tenant-group",
        name: "Missing tenant group",
        updatedAt: new Date(),
        updatedBy: { id: "legacy-admin", name: "Legacy admin" },
      }),
      db.doc("priceLists/missing-tenant-price-list").set({
        active: true,
        createdAt: new Date(),
        createdBy: { id: "legacy-admin", name: "Legacy admin" },
        currency: "PLN",
        entries: [],
        id: "missing-tenant-price-list",
        name: "Missing tenant price list",
        priority: 0,
        updatedAt: new Date(),
        updatedBy: { id: "legacy-admin", name: "Legacy admin" },
      }),
    ]);
  });
}

async function seedStorage(testEnv: RulesTestEnvironment) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage(BUCKET_URL);

    await Promise.all([
      storage
        .ref(
          "tenants/tenant-a/channels/tenant-a-channel/orders/customer-a/order-a/items/item-a/file.pdf",
        )
        .putString("tenant-a-channel", "raw", {
          contentType: "application/pdf",
        }),
      storage
        .ref(
          "tenants/tenant-a/channels/tenant-a-other-channel/orders/customer-a/order-a/items/item-a/file.pdf",
        )
        .putString("tenant-a-other-channel", "raw", {
          contentType: "application/pdf",
        }),
      storage
        .ref("tenants/tenant-a/orders/customer-a/order-a/items/item-a/file.pdf")
        .putString("tenant-a", "raw", { contentType: "application/pdf" }),
      storage
        .ref("tenants/tenant-b/orders/customer-b/order-b/items/item-b/file.pdf")
        .putString("tenant-b", "raw", { contentType: "application/pdf" }),
      storage
        .ref("orders/customer-b/order-b/items/item-b/file.pdf")
        .putString("legacy", "raw", { contentType: "application/pdf" }),
    ]);
  });
}

describeWithFirebaseEmulators("Firebase security rules", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: firestoreRules,
      },
      storage: {
        rules: storageRules,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await seedFirestore(testEnv);
    await seedStorage(testEnv);
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  describe("Firestore tenant-owned documents", () => {
    it("denies tenant A admins and members access to tenant B documents", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantAMemberDb = testEnv
        .authenticatedContext(tenantAMemberUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb.doc("warehouses/tenant-a-warehouse").get(),
      );
      await assertFails(
        tenantAAdminDb.doc("warehouses/tenant-b-warehouse").get(),
      );
      await assertFails(
        tenantAMemberDb.doc("warehouses/tenant-b-warehouse").get(),
      );
      await assertFails(
        tenantAAdminDb.doc("warehouses/tenant-b-warehouse").update({
          ...tenantOwnedDocument(tenantB),
          name: "Tenant B from tenant A",
        }),
      );
      await assertFails(
        tenantAMemberDb.doc("warehouses/tenant-b-member-write").set({
          ...tenantOwnedDocument(tenantB),
          id: "tenant-b-member-write",
        }),
      );
    });

    it("allows normal admins to bridge dedicated/default documents", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb.doc("warehouses/missing-tenant-warehouse").get(),
      );
      await assertSucceeds(
        tenantAAdminDb.doc("warehouses/default-warehouse").get(),
      );
      await assertFails(
        tenantAAdminDb.doc("warehouses/missing-tenant-warehouse").update({
          id: "missing-tenant-warehouse",
          name: "Claimed by tenant A",
          tenantId: tenantA,
          active: true,
        }),
      );
      await assertSucceeds(
        tenantAAdminDb.doc("warehouses/default-warehouse").update({
          ...tenantOwnedDocument(defaultTenant),
          name: "Default from tenant A",
        }),
      );
      await assertFails(
        tenantAAdminDb.doc("warehouses/default-warehouse").update({
          ...tenantOwnedDocument(tenantA),
          id: "default-warehouse",
        }),
      );
    });

    it("limits channel-scoped admins to selected channel documents", async () => {
      const channelLimitedDb = testEnv
        .authenticatedContext(tenantAChannelLimitedAdminUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        channelLimitedDb
          .doc(`channels/${tenantA}-channel/orders/${tenantA}-order`)
          .get(),
      );
      await assertSucceeds(
        channelLimitedDb
          .doc(`channels/${tenantA}-channel/orders/${tenantA}-order`)
          .update({
            status: "IN_PROGRESS",
          }),
      );
      await assertFails(
        channelLimitedDb
          .doc(
            `channels/${tenantA}-other-channel/orders/${tenantA}-other-order`,
          )
          .get(),
      );
      await assertFails(
        channelLimitedDb.doc("warehouses/tenant-a-warehouse").get(),
      );
    });

    it("keeps owners and missing channelIds at full tenant scope", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantAOwnerDb = testEnv
        .authenticatedContext(tenantAOwnerUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb
          .doc(
            `channels/${tenantA}-other-channel/orders/${tenantA}-other-order`,
          )
          .get(),
      );
      await assertSucceeds(
        tenantAOwnerDb.doc("warehouses/tenant-a-warehouse").get(),
      );
    });

    it("allows tenant admins to soft-delete own product types but not hard-delete them", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb.doc("productTypes/tenant-a-product-type").update({
          active: false,
        }),
      );
      await assertFails(
        tenantAAdminDb.doc("productTypes/tenant-a-product-type").delete(),
      );
    });

    it("enforces explicit catalog create permissions", async () => {
      const productCreatorDb = testEnv
        .authenticatedContext(tenantAProductCreatorUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        productCreatorDb.doc("products/tenant-a-created-product").set({
          ...tenantOwnedDocument(tenantA),
          id: "tenant-a-created-product",
        }),
      );
      await assertFails(
        productCreatorDb.doc("attributes/tenant-a-denied-attribute").set({
          ...tenantOwnedDocument(tenantA),
          id: "tenant-a-denied-attribute",
        }),
      );
      await assertFails(
        productCreatorDb.doc("products/tenant-b-created-product").set({
          ...tenantOwnedDocument(tenantB),
          id: "tenant-b-created-product",
        }),
      );
    });

    it("allows tenant owners to manage tenant memberships but denies tenant admins", async () => {
      const tenantAOwnerDb = testEnv
        .authenticatedContext(tenantAOwnerUid, adminToken(1))
        .firestore();
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAOwnerDb
          .doc(`tenantMemberships/${tenantA}_new-admin`)
          .set(membership(tenantA, "new-admin", "ADMIN", [])),
      );
      await assertFails(
        tenantAAdminDb
          .doc(`tenantMemberships/${tenantA}_new-member`)
          .set(membership(tenantA, "new-member", "MEMBER", [])),
      );
    });

    it("keeps AI instruction settings private and owner-managed", async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      const tenantAOwnerDb = testEnv
        .authenticatedContext(tenantAOwnerUid, adminToken(1))
        .firestore();
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const superAdminDb = testEnv
        .authenticatedContext(superAdminUid, adminToken(9999))
        .firestore();
      const aiInstructionsPath = `channels/${tenantA}-channel/settings/aiInstructions`;

      await assertFails(publicDb.doc(aiInstructionsPath).get());
      await assertSucceeds(tenantAOwnerDb.doc(aiInstructionsPath).get());
      await assertSucceeds(superAdminDb.doc(aiInstructionsPath).get());
      await assertFails(
        tenantAAdminDb
          .doc(aiInstructionsPath)
          .set(aiInstructionsDocument(tenantA)),
      );
      await assertSucceeds(
        tenantAOwnerDb
          .doc(aiInstructionsPath)
          .set(aiInstructionsDocument(tenantA)),
      );
    });

    it("keeps public storefront settings readable without admin access", async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      const publicSettingPath = `channels/${tenantA}-channel/settings/buying`;

      await assertSucceeds(publicDb.doc(publicSettingPath).get());
      await assertFails(
        publicDb.doc(publicSettingPath).set({
          enabled: false,
          tenantId: tenantA,
        }),
      );
    });

    it("authorizes product image generation config through the parent product tenant", async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantBAdminDb = testEnv
        .authenticatedContext(tenantBAdminUid, adminToken(1))
        .firestore();
      const configPath = `channels/${tenantA}-channel/products/${tenantA}-product/imageGeneration/config`;
      const missingConfigPath = `channels/${tenantA}-channel/products/${tenantA}-product-without-config/imageGeneration/config`;

      await assertFails(publicDb.doc(configPath).get());
      await assertSucceeds(tenantAAdminDb.doc(configPath).get());
      await assertSucceeds(tenantAAdminDb.doc(missingConfigPath).get());
      await assertFails(tenantBAdminDb.doc(configPath).get());
      await assertSucceeds(
        tenantAAdminDb.doc(missingConfigPath).set({
          enabled: true,
          promptEnhancement: "Use a flat lay composition.",
        }),
      );
      await assertFails(
        tenantBAdminDb.doc(configPath).set({
          enabled: true,
        }),
      );
    });

    it("denies tenant id reassignment on tenant-owned updates", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();

      await assertFails(
        tenantAAdminDb.doc("productTypes/tenant-a-product-type").update({
          tenantId: tenantB,
        }),
      );
    });

    it("denies tenant members write access to tenant-owned admin documents", async () => {
      const tenantAMemberDb = testEnv
        .authenticatedContext(tenantAMemberUid, adminToken(1))
        .firestore();

      await assertFails(
        tenantAMemberDb.doc("productTypes/tenant-a-member-created").set({
          ...productTypeDocument(tenantA),
          id: "tenant-a-member-created",
        }),
      );
      await assertFails(
        tenantAMemberDb.doc("productTypes/tenant-a-product-type").update({
          name: "Changed by member",
        }),
      );
    });

    it("prevents cross-tenant update bypasses in attribute translations", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantBAdminDb = testEnv
        .authenticatedContext(tenantBAdminUid, adminToken(1))
        .firestore();
      const translationPath =
        "attributes/tenant-b-attribute/options/option-a/translations/en";

      await assertFails(
        tenantAAdminDb.doc(translationPath).update({
          name: "Claimed translation",
          tenantId: tenantA,
        }),
      );
      await assertSucceeds(
        tenantBAdminDb.doc(translationPath).update({
          name: "Updated translation",
        }),
      );
    });

    it("scopes FCM token documents to the signed-in admin tenant", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb.doc(`fcmTokens/${tenantAAdminUid}`).get(),
      );
      await assertFails(
        tenantAAdminDb.doc(`fcmTokens/${tenantBAdminUid}`).get(),
      );
      await assertFails(
        tenantAAdminDb.doc(`fcmTokens/${tenantBAdminUid}`).update({
          tokens: [],
        }),
      );
      await assertSucceeds(
        tenantAAdminDb.doc(`fcmTokens/${tenantAAdminUid}`).set({
          ...fcmTokenDocument(tenantA, tenantAAdminUid),
          tokens: [],
        }),
      );
    });

    it("scopes customer groups and price lists to tenant admins", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const productCreatorDb = testEnv
        .authenticatedContext(tenantAProductCreatorUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb.doc("customerGroups/tenant-a-group").get(),
      );
      await assertSucceeds(
        tenantAAdminDb
          .collection("customerGroups")
          .where("tenantId", "==", tenantA)
          .get(),
      );
      await assertFails(
        tenantAAdminDb.doc("customerGroups/tenant-b-group").get(),
      );
      await assertSucceeds(
        tenantAAdminDb.doc("customerGroups/tenant-a-created-group").set({
          ...customerGroupDocument(tenantA),
          id: "tenant-a-created-group",
        }),
      );
      await assertFails(
        productCreatorDb.doc("customerGroups/tenant-a-product-group").set({
          ...customerGroupDocument(tenantA),
          id: "tenant-a-product-group",
        }),
      );
      await assertSucceeds(
        tenantAAdminDb.doc("priceLists/tenant-a-price-list").get(),
      );
      await assertSucceeds(
        tenantAAdminDb
          .collection("priceLists")
          .where("tenantId", "==", tenantA)
          .get(),
      );
      await assertFails(
        tenantAAdminDb.doc("priceLists/tenant-b-price-list").get(),
      );
      await assertSucceeds(
        tenantAAdminDb.doc("priceLists/tenant-a-price-list").update({
          priority: 1,
        }),
      );
      await assertFails(
        productCreatorDb.doc("priceLists/tenant-a-product-price-list").set({
          ...priceListDocument(tenantA),
          id: "tenant-a-product-price-list",
        }),
      );
    });

    it("allows order managers to create new customers without broader customer management", async () => {
      const orderManagerDb = testEnv
        .authenticatedContext(tenantAOrderManagerUid, adminToken(1))
        .firestore();
      const productCreatorDb = testEnv
        .authenticatedContext(tenantAProductCreatorUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        orderManagerDb.runTransaction(async (transaction) => {
          const customerRef = orderManagerDb.doc(
            "customers/order-manager-created-customer",
          );
          const customerSnapshot = await transaction.get(customerRef);

          if (customerSnapshot.exists) {
            throw new Error("Customer should not exist before create.");
          }

          transaction.set(customerRef, {
            ...customerDocument(tenantA, "order-manager-created-customer"),
            createdBy: { id: tenantAOrderManagerUid, name: "Order manager" },
          });
        }),
      );
      await assertFails(
        orderManagerDb.doc(`customers/${tenantACustomerUid}`).update({
          name: "Updated without customers.manage",
        }),
      );
      await assertFails(
        orderManagerDb.doc("customers/order-manager-cross-tenant").set({
          ...customerDocument(tenantB, "order-manager-cross-tenant"),
          createdBy: { id: tenantAOrderManagerUid, name: "Order manager" },
        }),
      );
      await assertFails(
        productCreatorDb.doc("customers/product-creator-customer").set({
          ...customerDocument(tenantA, "product-creator-customer"),
          createdBy: { id: tenantAProductCreatorUid, name: "Product creator" },
        }),
      );
    });

    it("allows admins to get missing customer documents without rule errors", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantACustomerDb = testEnv
        .authenticatedContext(tenantACustomerUid)
        .firestore();

      await assertSucceeds(tenantAAdminDb.doc("customers/not-created").get());
      await assertFails(tenantACustomerDb.doc("customers/not-created").get());
    });

    it("allows legacy dedicated admins to create default customers", async () => {
      const legacyDedicatedAdminDb = testEnv
        .authenticatedContext("legacy-dedicated-admin", adminToken(5000))
        .firestore();

      await assertSucceeds(
        legacyDedicatedAdminDb.runTransaction(async (transaction) => {
          const customerRef = legacyDedicatedAdminDb.doc(
            "customers/default-order-customer",
          );
          const customerSnapshot = await transaction.get(customerRef);

          if (customerSnapshot.exists) {
            throw new Error("Customer should not exist before create.");
          }

          transaction.set(customerRef, {
            ...customerDocument(defaultTenant, "default-order-customer"),
            createdBy: { id: "legacy-dedicated-admin", name: "Legacy admin" },
          });
        }),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("customers/legacy-order-customer").set({
          active: true,
          createdBy: { id: "legacy-dedicated-admin", name: "Legacy admin" },
          id: "legacy-order-customer",
          name: "Legacy order customer",
        }),
      );
      await assertFails(
        legacyDedicatedAdminDb.doc("customers/tenant-a-created-customer").set({
          ...customerDocument(tenantA, "tenant-a-created-customer"),
          createdBy: { id: "legacy-dedicated-admin", name: "Legacy admin" },
        }),
      );
    });

    it("scopes Fakturownia cost evidence and mappings to tenant admins", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantBAdminDb = testEnv
        .authenticatedContext(tenantBAdminUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb
          .doc("fakturowniaCostEvidence/tenant-a-cost-evidence")
          .get(),
      );
      await assertSucceeds(
        tenantAAdminDb
          .doc("fakturowniaCostMappings/tenant-a-cost-mapping")
          .get(),
      );
      await assertFails(
        tenantAAdminDb
          .doc("fakturowniaCostEvidence/tenant-b-cost-evidence")
          .get(),
      );
      await assertFails(
        tenantAAdminDb
          .doc("fakturowniaCostMappings/tenant-b-cost-mapping")
          .get(),
      );
      await assertSucceeds(
        tenantBAdminDb
          .doc("fakturowniaCostMappings/tenant-b-cost-mapping")
          .update({
            status: "approved",
          }),
      );
      await assertFails(
        tenantAAdminDb
          .doc("fakturowniaCostMappings/tenant-b-cost-mapping")
          .update({
            status: "rejected",
          }),
      );
    });

    it("scopes customer store credit transactions through the customer tenant", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantBAdminDb = testEnv
        .authenticatedContext(tenantBAdminUid, adminToken(1))
        .firestore();
      const productCreatorDb = testEnv
        .authenticatedContext(tenantAProductCreatorUid, adminToken(1))
        .firestore();
      const transactionPath = `customers/${tenantACustomerUid}/storeCreditTransactions/${tenantA}-store-credit`;

      await assertSucceeds(tenantAAdminDb.doc(transactionPath).get());
      await assertFails(tenantBAdminDb.doc(transactionPath).get());
      await assertSucceeds(
        tenantAAdminDb
          .collection(`customers/${tenantACustomerUid}/storeCreditTransactions`)
          .get(),
      );
      await assertSucceeds(
        tenantAAdminDb
          .doc(
            `customers/${tenantACustomerUid}/storeCreditTransactions/tenant-a-created-store-credit`,
          )
          .set({
            ...storeCreditTransactionDocument(tenantA, tenantACustomerUid),
            id: "tenant-a-created-store-credit",
          }),
      );
      await assertSucceeds(
        tenantAAdminDb.doc(transactionPath).update({
          reversalTransactionId: "reversal-1",
        }),
      );
      await assertFails(
        productCreatorDb
          .doc(
            `customers/${tenantACustomerUid}/storeCreditTransactions/tenant-a-product-store-credit`,
          )
          .set({
            ...storeCreditTransactionDocument(tenantA, tenantACustomerUid),
            id: "tenant-a-product-store-credit",
          }),
      );
    });

    it("allows dedicated/default admins without tenant memberships to create orders and counters", async () => {
      const dedicatedDefaultAdminDb = testEnv
        .authenticatedContext(dedicatedDefaultAdminUid, adminToken(1))
        .firestore();
      const defaultOrderPath =
        "channels/default-channel/orders/dedicated-default-order";
      const tenantOrderPath = `channels/${tenantA}-channel/orders/dedicated-default-tenant-a-order`;
      const defaultOrderCounterPath =
        "channels/default-channel/counters/orders";
      const tenantOrderCounterPath = `channels/${tenantA}-channel/counters/orders`;

      await assertSucceeds(
        dedicatedDefaultAdminDb.doc(defaultOrderPath).set({
          ...orderDocument(defaultTenant, `${defaultTenant}-customer`),
          id: "dedicated-default-order",
          number: 7001,
        }),
      );
      await assertFails(
        dedicatedDefaultAdminDb.doc(tenantOrderPath).set({
          ...orderDocument(tenantA, tenantACustomerUid),
          id: "dedicated-default-tenant-a-order",
          number: 7002,
        }),
      );
      await assertSucceeds(
        dedicatedDefaultAdminDb.doc(defaultOrderCounterPath).set({
          nextNumber: 7002,
          tenantId: defaultTenant,
        }),
      );
      await assertSucceeds(
        dedicatedDefaultAdminDb.doc(defaultOrderCounterPath).update({
          nextNumber: 7003,
        }),
      );
      await assertFails(
        dedicatedDefaultAdminDb.doc(tenantOrderCounterPath).set({
          nextNumber: 7004,
          tenantId: tenantA,
        }),
      );
    });

    it("allows only authorized tenant admins to manage order and quote counters", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantBAdminDb = testEnv
        .authenticatedContext(tenantBAdminUid, adminToken(1))
        .firestore();
      const defaultAdminDb = testEnv
        .authenticatedContext(defaultAdminUid, adminToken(1))
        .firestore();
      const productCreatorDb = testEnv
        .authenticatedContext(tenantAProductCreatorUid, adminToken(1))
        .firestore();
      const orderCounterPath = `channels/${tenantA}-channel/counters/orders`;
      const legacyOrderCounterPath = "channels/legacy-channel/counters/orders";

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc("channels/legacy-channel").set({
          active: true,
          id: "legacy-channel",
          name: "Legacy channel",
        });
      });

      await assertSucceeds(tenantAAdminDb.doc(orderCounterPath).get());
      await assertSucceeds(
        tenantAAdminDb.doc(orderCounterPath).set({
          nextNumber: 7001,
          tenantId: tenantA,
        }),
      );
      await assertSucceeds(
        tenantAAdminDb.doc(orderCounterPath).update({
          nextNumber: 7002,
        }),
      );
      await assertSucceeds(tenantAAdminDb.doc(orderCounterPath).get());
      await assertFails(tenantBAdminDb.doc(orderCounterPath).get());
      await assertFails(
        productCreatorDb
          .doc(`channels/${tenantA}-channel/counters/orders`)
          .set({
            nextNumber: 1,
            tenantId: tenantA,
          }),
      );
      await assertFails(
        tenantBAdminDb.doc(`channels/${tenantA}-channel/counters/orders`).set({
          nextNumber: 1,
          tenantId: tenantB,
        }),
      );
      await assertSucceeds(
        tenantAAdminDb.doc(`channels/${tenantA}-channel/counters/quotes`).set({
          nextNumber: 300,
          tenantId: tenantA,
        }),
      );
      await assertFails(
        tenantAAdminDb
          .doc(`channels/${tenantA}-channel/counters/products`)
          .set({
            nextNumber: 1,
            tenantId: tenantA,
          }),
      );
      await assertFails(
        tenantAAdminDb.doc(`channels/${tenantA}-channel/counters/orders`).set({
          nextNumber: -1,
          tenantId: tenantA,
        }),
      );
      await assertSucceeds(defaultAdminDb.doc(legacyOrderCounterPath).get());
      await assertSucceeds(
        defaultAdminDb.doc(legacyOrderCounterPath).set({
          nextNumber: 12,
          tenantId: defaultTenant,
        }),
      );
      await assertSucceeds(
        defaultAdminDb.doc(legacyOrderCounterPath).update({
          nextNumber: 13,
        }),
      );
      await assertSucceeds(tenantAAdminDb.doc(legacyOrderCounterPath).get());
      await assertFails(
        tenantAAdminDb.doc(legacyOrderCounterPath).set({
          nextNumber: 1,
          tenantId: tenantA,
        }),
      );
    });

    it("authorizes imposition suggestion cache through the parent order", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantBAdminDb = testEnv
        .authenticatedContext(tenantBAdminUid, adminToken(1))
        .firestore();
      const suggestionPath = `channels/${tenantA}-channel/orders/${tenantA}-order/impositionTemplateSuggestions/latest`;

      await assertSucceeds(tenantAAdminDb.doc(suggestionPath).get());
      await assertFails(tenantBAdminDb.doc(suggestionPath).get());
      await assertSucceeds(
        tenantAAdminDb
          .doc(suggestionPath)
          .set(impositionSuggestionDocument(tenantA)),
      );
      await assertFails(
        tenantAAdminDb
          .doc(
            `channels/${tenantA}-channel/orders/${tenantA}-order/impositionTemplateSuggestions/cross-tenant`,
          )
          .set(impositionSuggestionDocument(tenantB)),
      );
      await assertFails(
        tenantBAdminDb
          .doc(suggestionPath)
          .set(impositionSuggestionDocument(tenantB)),
      );
    });

    it("allows legacy dedicated admins to read and write default imposition suggestion cache", async () => {
      const legacyDedicatedAdminDb = testEnv
        .authenticatedContext("legacy-dedicated-admin", adminToken(5000))
        .firestore();
      const defaultSuggestionPath =
        "channels/default-channel/orders/default-order/impositionTemplateSuggestions/latest";
      const legacySuggestionPath =
        "channels/legacy-channel/orders/legacy-order/impositionTemplateSuggestions/latest";
      const tenantSuggestionPath = `channels/${tenantA}-channel/orders/${tenantA}-order/impositionTemplateSuggestions/latest`;

      await assertSucceeds(
        legacyDedicatedAdminDb.doc(legacySuggestionPath).get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb
          .doc(defaultSuggestionPath)
          .set(impositionSuggestionDocument(defaultTenant)),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb
          .doc(legacySuggestionPath)
          .set(impositionSuggestionDocument()),
      );
      await assertFails(legacyDedicatedAdminDb.doc(tenantSuggestionPath).get());
    });

    it("keeps default tenant compatibility explicit", async () => {
      const defaultAdminDb = testEnv
        .authenticatedContext(defaultAdminUid, adminToken(1))
        .firestore();
      const legacyDedicatedAdminDb = testEnv
        .authenticatedContext("legacy-dedicated-admin", adminToken(5000))
        .firestore();
      const superAdminDb = testEnv
        .authenticatedContext(superAdminUid, adminToken(9999))
        .firestore();

      await assertSucceeds(
        defaultAdminDb.doc("warehouses/default-warehouse").get(),
      );
      await assertSucceeds(
        defaultAdminDb.doc("warehouses/default-created").set({
          ...tenantOwnedDocument(defaultTenant),
          id: "default-created",
        }),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("warehouses/default-warehouse").get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("warehouses/missing-tenant-warehouse").get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("customerGroups/default-group").get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb
          .collection("customerGroups")
          .where("tenantId", "==", defaultTenant)
          .get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("customerGroups/missing-tenant-group").get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("priceLists/default-price-list").get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb
          .collection("priceLists")
          .where("tenantId", "==", defaultTenant)
          .get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb
          .doc("priceLists/missing-tenant-price-list")
          .get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb
          .doc(
            `customers/${defaultTenant}-customer/storeCreditTransactions/${defaultTenant}-store-credit`,
          )
          .get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb
          .doc(
            "customers/missing-tenant-customer/storeCreditTransactions/missing-tenant-store-credit",
          )
          .get(),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("warehouses/legacy-created").set({
          id: "legacy-created",
          name: "Legacy created",
          active: true,
        }),
      );
      await assertSucceeds(
        legacyDedicatedAdminDb.doc("warehouses/default-warehouse").update({
          name: "Default from legacy admin",
        }),
      );
      await assertFails(
        legacyDedicatedAdminDb.doc("warehouses/tenant-a-warehouse").get(),
      );
      await assertFails(
        legacyDedicatedAdminDb.doc("customerGroups/tenant-a-group").get(),
      );
      await assertFails(
        legacyDedicatedAdminDb.doc("priceLists/tenant-a-price-list").get(),
      );
      await assertFails(
        legacyDedicatedAdminDb
          .doc(
            `customers/${tenantACustomerUid}/storeCreditTransactions/${tenantA}-store-credit`,
          )
          .get(),
      );
      await assertFails(
        legacyDedicatedAdminDb.doc("warehouses/tenant-a-warehouse").update({
          name: "Tenant A from legacy admin",
        }),
      );
      await assertSucceeds(
        superAdminDb.doc("warehouses/missing-tenant-warehouse").get(),
      );
    });
  });

  describe("Firestore cart items", () => {
    it("allows customers without profile documents to manage legacy dedicated cart items", async () => {
      const dedicatedCustomerUid = "dedicated-cart-customer";
      const dedicatedCustomerDb = testEnv
        .authenticatedContext(dedicatedCustomerUid)
        .firestore();
      const cartItemRef = dedicatedCustomerDb.doc(
        `carts/${dedicatedCustomerUid}/items/default-item`,
      );
      const transactionCartItemRef = dedicatedCustomerDb.doc(
        `carts/${dedicatedCustomerUid}/items/transaction-item`,
      );

      await assertSucceeds(
        dedicatedCustomerDb.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(transactionCartItemRef);

          if (snapshot.exists) {
            throw new Error("Cart item should not exist before create.");
          }

          transaction.set(transactionCartItemRef, {
            id: "transaction-item",
            name: "Transaction default cart item",
            tenantId: defaultTenant,
          });
        }),
      );

      await assertSucceeds(
        cartItemRef.set({
          id: "default-item",
          name: "Default cart item",
          tenantId: defaultTenant,
        }),
      );
      await assertSucceeds(cartItemRef.get());
      await assertSucceeds(
        cartItemRef.update({
          name: "Updated default cart item",
          tenantId: defaultTenant,
        }),
      );
      await assertSucceeds(cartItemRef.delete());
    });

    it("allows customers to listen to tenant-scoped cart preflight jobs", async () => {
      const dedicatedCustomerUid = "dedicated-preflight-customer";
      const dedicatedCustomerDb = testEnv
        .authenticatedContext(dedicatedCustomerUid)
        .firestore();
      const tenantACustomerDb = testEnv
        .authenticatedContext(tenantACustomerUid)
        .firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        await Promise.all([
          db.doc(`carts/${dedicatedCustomerUid}/preflight/default-job`).set({
            id: "default-job",
            itemId: "item-a",
            status: "pending",
            tenantId: defaultTenant,
          }),
          db.doc(`carts/${tenantACustomerUid}/preflight/tenant-a-job`).set({
            id: "tenant-a-job",
            itemId: "item-a",
            status: "pending",
            tenantId: tenantA,
          }),
          db.doc(`carts/${tenantACustomerUid}/preflight/tenant-b-job`).set({
            id: "tenant-b-job",
            itemId: "item-b",
            status: "pending",
            tenantId: tenantB,
          }),
        ]);
      });

      await assertSucceeds(
        dedicatedCustomerDb
          .collection(`carts/${dedicatedCustomerUid}/preflight`)
          .where("tenantId", "==", defaultTenant)
          .get(),
      );
      await assertSucceeds(
        tenantACustomerDb
          .collection(`carts/${tenantACustomerUid}/preflight`)
          .where("tenantId", "==", tenantA)
          .get(),
      );
      await assertFails(
        tenantACustomerDb
          .collection(`carts/${tenantACustomerUid}/preflight`)
          .where("tenantId", "==", tenantB)
          .get(),
      );
    });

    it("keeps SaaS tenant cart items tied to the customer tenant", async () => {
      const noProfileCustomerUid = "cart-customer-without-profile";
      const noProfileCustomerDb = testEnv
        .authenticatedContext(noProfileCustomerUid)
        .firestore();
      const tenantACustomerDb = testEnv
        .authenticatedContext(tenantACustomerUid)
        .firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context
          .firestore()
          .doc(`carts/${tenantACustomerUid}/items/tenant-b-owned`)
          .set({
            id: "tenant-b-owned",
            name: "Tenant B item in tenant A customer cart",
            tenantId: tenantB,
          });
      });

      await assertFails(
        noProfileCustomerDb
          .doc(`carts/${noProfileCustomerUid}/items/tenant-a-item`)
          .set({
            id: "tenant-a-item",
            name: "Tenant A item",
            tenantId: tenantA,
          }),
      );
      await assertSucceeds(
        tenantACustomerDb.doc(`carts/${tenantACustomerUid}/items/item-a`).set({
          id: "item-a",
          name: "Tenant A item",
          tenantId: tenantA,
        }),
      );
      await assertFails(
        tenantACustomerDb.doc(`carts/${tenantACustomerUid}/items/item-b`).set({
          id: "item-b",
          name: "Tenant B item",
          tenantId: tenantB,
        }),
      );
      await assertFails(
        tenantACustomerDb
          .doc(`carts/${tenantACustomerUid}/items/tenant-b-owned`)
          .get(),
      );
    });
  });

  describe("Firestore RMA requests", () => {
    it("allows customers to read only their own RMA requests", async () => {
      const tenantACustomerDb = testEnv
        .authenticatedContext(tenantACustomerUid)
        .firestore();

      await assertSucceeds(
        tenantACustomerDb
          .doc(`channels/${tenantA}-channel/rmaRequests/${tenantA}-rma`)
          .get(),
      );
      await assertFails(
        tenantACustomerDb
          .doc(`channels/${tenantB}-channel/rmaRequests/${tenantB}-rma`)
          .get(),
      );
      await assertFails(
        tenantACustomerDb
          .doc(`channels/${tenantA}-channel/rmaRequests/customer-created`)
          .set(rmaRequestDocument(tenantA, tenantACustomerUid)),
      );
    });

    it("keeps admin RMA access tenant scoped", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb
          .doc(`channels/${tenantA}-channel/rmaRequests/${tenantA}-rma`)
          .get(),
      );
      await assertFails(
        tenantAAdminDb
          .doc(`channels/${tenantB}-channel/rmaRequests/${tenantB}-rma`)
          .get(),
      );
    });
  });

  describe("Firestore storefront content", () => {
    it("allows public reads but denies direct client writes", async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const storefrontHomePath = `channels/${tenantA}-channel/storefront/home`;

      await assertSucceeds(publicDb.doc(storefrontHomePath).get());
      await assertSucceeds(
        publicDb.doc(`channels/${tenantA}-channel/storefront/theme`).get(),
      );
      await assertFails(
        tenantAAdminDb.doc(storefrontHomePath).set({
          blocks: [],
          id: "home",
        }),
      );
      await assertFails(publicDb.doc(storefrontHomePath).delete());
    });
  });

  describe("Firestore agent memory", () => {
    it("allows tenant staff to read only active memory for their tenant", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();
      const tenantAMemberDb = testEnv
        .authenticatedContext(tenantAMemberUid, adminToken(1))
        .firestore();

      await assertSucceeds(
        tenantAAdminDb.doc("agentMemories/tenant-a-active-memory").get(),
      );
      await assertSucceeds(
        tenantAMemberDb.doc("agentMemories/tenant-a-active-memory").get(),
      );
      await assertFails(
        tenantAAdminDb.doc("agentMemories/tenant-a-pending-memory").get(),
      );
      await assertFails(
        tenantAAdminDb.doc("agentMemories/tenant-b-active-memory").get(),
      );
    });

    it("denies direct client writes for agent memory", async () => {
      const tenantAAdminDb = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .firestore();

      await assertFails(
        tenantAAdminDb.doc("agentMemories/client-created-memory").set({
          ...agentMemoryDocument(tenantA),
          id: "client-created-memory",
        }),
      );
      await assertFails(
        tenantAAdminDb.doc("agentMemories/tenant-a-active-memory").update({
          content: "Client edited memory",
        }),
      );
      await assertFails(
        tenantAAdminDb.doc("agentMemories/tenant-a-active-memory").delete(),
      );
    });
  });

  describe("Storage tenant prefixes", () => {
    it("denies tenant A admins access to tenant B files", async () => {
      const tenantAStorage = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .storage(BUCKET_URL);

      await assertSucceeds(
        tenantAStorage
          .ref(
            "tenants/tenant-a/orders/customer-a/order-a/items/item-a/file.pdf",
          )
          .getMetadata(),
      );
      await assertFails(
        tenantAStorage
          .ref(
            "tenants/tenant-b/orders/customer-b/order-b/items/item-b/file.pdf",
          )
          .getMetadata(),
      );
    });

    it("limits SaaS channel-aware order files to selected channels", async () => {
      const channelLimitedStorage = testEnv
        .authenticatedContext(tenantAChannelLimitedAdminUid, adminToken(1))
        .storage(BUCKET_URL);

      await assertSucceeds(
        channelLimitedStorage
          .ref(
            "tenants/tenant-a/channels/tenant-a-channel/orders/customer-a/order-a/items/item-a/file.pdf",
          )
          .getMetadata(),
      );
      await assertSucceeds(
        channelLimitedStorage
          .ref(
            "tenants/tenant-a/channels/tenant-a-channel/thumb_orders/customer-a/order-a/items/item-a/thumb_file.png",
          )
          .putString("thumbnail", "raw", { contentType: "image/png" }),
      );
      await assertFails(
        channelLimitedStorage
          .ref(
            "tenants/tenant-a/channels/tenant-a-other-channel/orders/customer-a/order-a/items/item-a/file.pdf",
          )
          .getMetadata(),
      );
      await assertFails(
        channelLimitedStorage
          .ref(
            "tenants/tenant-a/orders/customer-a/order-a/items/item-a/file.pdf",
          )
          .getMetadata(),
      );
    });

    it("keeps legacy storage paths behind explicit default access", async () => {
      const tenantAStorage = testEnv
        .authenticatedContext(tenantAAdminUid, adminToken(1))
        .storage(BUCKET_URL);
      const defaultStorage = testEnv
        .authenticatedContext(defaultAdminUid, adminToken(1))
        .storage(BUCKET_URL);
      const legacyDedicatedStorage = testEnv
        .authenticatedContext("legacy-dedicated-admin", adminToken(5000))
        .storage(BUCKET_URL);

      await assertFails(
        tenantAStorage
          .ref("orders/customer-b/order-b/items/item-b/file.pdf")
          .getMetadata(),
      );
      await assertSucceeds(
        defaultStorage
          .ref("orders/customer-b/order-b/items/item-b/file.pdf")
          .getMetadata(),
      );
      await assertSucceeds(
        legacyDedicatedStorage
          .ref("orders/customer-b/order-b/items/item-b/file.pdf")
          .getMetadata(),
      );
      await assertSucceeds(
        legacyDedicatedStorage
          .ref("thumb_orders/customer-b/order-b/items/item-b/thumb_file.png")
          .putString("thumbnail", "raw", { contentType: "image/png" }),
      );
      await assertFails(
        legacyDedicatedStorage
          .ref(
            "tenants/tenant-a/orders/customer-a/order-a/items/item-a/file.pdf",
          )
          .getMetadata(),
      );
    });
  });
});
