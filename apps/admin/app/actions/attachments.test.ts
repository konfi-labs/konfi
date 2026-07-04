import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  bucketFile: vi.fn(),
  customerDoc: vi.fn(),
  firestoreCollection: vi.fn(),
  firestoreDoc: vi.fn(),
  getMetadata: vi.fn(),
  download: vi.fn(),
  getTenantContextForRequest: vi.fn(),
  requireAdminAuth: vi.fn(),
  requireTenantAdminChannelAccess: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: actionMocks.requireAdminAuth,
  requireTenantAdminChannelAccess: actionMocks.requireTenantAdminChannelAccess,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: actionMocks.sendEmail,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(() => ({
    collection: actionMocks.firestoreCollection,
    doc: actionMocks.firestoreDoc,
  })),
  getAdminStorage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: actionMocks.bucketFile,
    })),
  })),
  getTenantContextForRequest: actionMocks.getTenantContextForRequest,
}));

vi.mock("@konfi/emails", () => ({
  AttachmentNotification: vi.fn(() => "attachment-email"),
}));

import { sendAttachmentNotificationForUploadedFile } from "./attachments";

function seedOrder(order: Record<string, unknown>) {
  actionMocks.firestoreDoc.mockReturnValue({
    get: vi.fn().mockResolvedValue({
      data: () => order,
      exists: true,
    }),
  });
}

describe("sendAttachmentNotificationForUploadedFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "bucket.appspot.com";
    process.env.NEXT_PUBLIC_STORE_CHANNEL_ID = "channel-1";
    actionMocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });
    actionMocks.requireAdminAuth.mockResolvedValue(undefined);
    actionMocks.requireTenantAdminChannelAccess.mockResolvedValue("channel-1");
    actionMocks.firestoreCollection.mockReturnValue({
      doc: actionMocks.customerDoc,
    });
    actionMocks.customerDoc.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        data: () => ({
          email: "customer@example.com",
          id: "customer-1",
          name: "Customer One",
        }),
      }),
    });
    actionMocks.bucketFile.mockReturnValue({
      download: actionMocks.download,
      getMetadata: actionMocks.getMetadata,
    });
    actionMocks.getMetadata.mockResolvedValue([
      {
        contentType: "application/pdf",
      },
    ]);
    actionMocks.download.mockResolvedValue([Buffer.from("pdf")]);
    actionMocks.sendEmail.mockResolvedValue(undefined);
    seedOrder({
      contact: { email: "contact@example.com", name: "Contact One" },
      customer: { id: "customer-1" },
      id: "order-1",
      number: 101,
    });
  });

  it("sends only an attachment stored under the authorized order customer path", async () => {
    await expect(
      sendAttachmentNotificationForUploadedFile({
        channelId: "channel-1",
        customerId: "customer-1",
        filePath: "attachments/customer-1/order-1/proof.pdf",
        orderId: "order-1",
      }),
    ).resolves.toMatchObject({ sent: true });

    expect(actionMocks.bucketFile).toHaveBeenCalledWith(
      "attachments/customer-1/order-1/proof.pdf",
    );
    expect(actionMocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects a caller-selected attachment path from another customer", async () => {
    await expect(
      sendAttachmentNotificationForUploadedFile({
        channelId: "channel-1",
        customerId: "customer-1",
        filePath: "attachments/customer-2/order-1/proof.pdf",
        orderId: "order-1",
      }),
    ).rejects.toThrow("Attachment does not belong to the selected order.");

    expect(actionMocks.bucketFile).not.toHaveBeenCalled();
    expect(actionMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("accepts SaaS attachment paths only for the authorized tenant channel", async () => {
    actionMocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-a",
    });

    await expect(
      sendAttachmentNotificationForUploadedFile({
        channelId: "channel-1",
        customerId: "customer-1",
        filePath:
          "tenants/tenant-a/channels/channel-1/attachments/customer-1/order-1/proof.pdf",
        orderId: "order-1",
      }),
    ).resolves.toMatchObject({ sent: true });

    expect(actionMocks.bucketFile).toHaveBeenCalledWith(
      "tenants/tenant-a/channels/channel-1/attachments/customer-1/order-1/proof.pdf",
    );

    await expect(
      sendAttachmentNotificationForUploadedFile({
        channelId: "channel-1",
        customerId: "customer-1",
        filePath:
          "tenants/tenant-a/channels/channel-2/attachments/customer-1/order-1/proof.pdf",
        orderId: "order-1",
      }),
    ).rejects.toThrow("Invalid attachment storage path.");
  });
});
