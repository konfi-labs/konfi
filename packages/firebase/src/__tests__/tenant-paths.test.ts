import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { describe, expect, it } from "vitest";
import { tenantFirestorePaths, tenantStoragePaths } from "../tenant-paths";

const dedicatedContext: TenantContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
};

const saasContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

describe("tenant Firestore paths", () => {
  it("keeps legacy Firestore collection paths and validates tenant context", () => {
    expect(tenantFirestorePaths.customerDoc(saasContext, "user-1")).toBe(
      "customers/user-1",
    );
    expect(
      tenantFirestorePaths.cartItemsCollection(saasContext, "user-1"),
    ).toBe("carts/user-1/items");
    expect(
      tenantFirestorePaths.channelDocument(
        saasContext,
        "channel-1",
        "orders",
        "order-1",
      ),
    ).toBe("channels/channel-1/orders/order-1");
  });

  it("rejects SaaS Firestore paths without a tenant id", () => {
    expect(() =>
      tenantFirestorePaths.customerDoc(
        {
          deploymentMode: "saas",
          requireTenantId: true,
        },
        "user-1",
      ),
    ).toThrow("Missing tenantId");
  });

  it("rejects path traversal and slash-bearing ids", () => {
    expect(() =>
      tenantFirestorePaths.orderDoc(saasContext, "channel-1", "../order"),
    ).toThrow("orderId");
    expect(() =>
      tenantFirestorePaths.orderDoc(saasContext, "channel-1", "bad/order"),
    ).toThrow("orderId");
  });
});

describe("tenant Storage paths", () => {
  it("keeps dedicated deployments on legacy storage paths", () => {
    expect(
      tenantStoragePaths.cartItemFile(
        dedicatedContext,
        "user-1",
        "item-1",
        "print.pdf",
      ),
    ).toBe("carts/user-1/items/item-1/print.pdf");
    expect(
      tenantStoragePaths.orderItemFile(
        dedicatedContext,
        "channel-1",
        "customer-1",
        "order-1",
        "item-1",
        "print.pdf",
      ),
    ).toBe("orders/customer-1/order-1/items/item-1/print.pdf");
    expect(
      tenantStoragePaths.orderAttachmentFile(
        dedicatedContext,
        "channel-1",
        "customer-1",
        "order-1",
        "proof.pdf",
      ),
    ).toBe("attachments/customer-1/order-1/proof.pdf");
  });

  it("prefixes SaaS storage paths with the tenant id", () => {
    expect(
      tenantStoragePaths.cartItemFile(
        saasContext,
        "user-1",
        "item-1",
        "print.pdf",
      ),
    ).toBe("tenants/tenant-a/carts/user-1/items/item-1/print.pdf");

    expect(
      tenantStoragePaths.productMediaFile(
        saasContext,
        "channel-1",
        "product-1",
        "cover.png",
      ),
    ).toBe(
      "tenants/tenant-a/images/channels/channel-1/products/product-1/cover.png",
    );
    expect(
      tenantStoragePaths.orderItemFile(
        saasContext,
        "channel-1",
        "customer-1",
        "order-1",
        "item-1",
        "print.pdf",
      ),
    ).toBe(
      "tenants/tenant-a/channels/channel-1/orders/customer-1/order-1/items/item-1/print.pdf",
    );
    expect(
      tenantStoragePaths.orderItemThumbnailFile(
        saasContext,
        "channel-1",
        "customer-1",
        "order-1",
        "item-1",
        "thumb_print.png",
      ),
    ).toBe(
      "tenants/tenant-a/channels/channel-1/thumb_orders/customer-1/order-1/items/item-1/thumb_print.png",
    );
    expect(
      tenantStoragePaths.orderAttachmentFile(
        saasContext,
        "channel-1",
        "customer-1",
        "order-1",
        "proof.pdf",
      ),
    ).toBe(
      "tenants/tenant-a/channels/channel-1/attachments/customer-1/order-1/proof.pdf",
    );
  });

  it("rejects malformed storage paths", () => {
    expect(() =>
      tenantStoragePaths.cartItemFile(saasContext, "user-1", "item-1", "../x"),
    ).toThrow("filename");
  });
});
