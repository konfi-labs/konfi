import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedAdminMember: vi.fn(),
  getTenantContextForRequest: vi.fn(),
  orderItemProblemNotification: vi.fn(),
  requireTenantAdminChannelAccess: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("./auth-utils", () => ({
  getAuthenticatedAdminMember: mocks.getAuthenticatedAdminMember,
  requireTenantAdminChannelAccess: mocks.requireTenantAdminChannelAccess,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(() => firestore),
  getTenantContextForRequest: mocks.getTenantContextForRequest,
}));

vi.mock("@konfi/emails", () => ({
  OrderItemProblemNotification: mocks.orderItemProblemNotification,
}));

const channelData = vi.hoisted(() => ({
  value: {
    id: "channel-1",
    name: "Main channel",
    notifications: {
      email: "ops@example.com",
      emails: ["secondary@example.com"],
    },
  },
}));

const orderData = vi.hoisted(() => ({
  value: {
    id: "order-1",
    items: [
      {
        id: "item-1",
        name: "Business cards",
        product: { name: "Premium business cards" },
      },
    ],
    number: 101,
  },
}));

const firestore = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(async () => ({
        data: () => channelData.value,
        exists: Boolean(channelData.value),
        id: "channel-1",
      })),
    })),
  })),
  doc: vi.fn(() => ({
    get: vi.fn(async () => ({
      data: () => orderData.value,
      exists: Boolean(orderData.value),
      id: "order-1",
    })),
  })),
};

import { sendOrderItemProblemNotification } from "./order-item-problems";

describe("sendOrderItemProblemNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_URL = "https://admin.example.com";
    process.env.NO_REPLY_EMAIL = "noreply@example.com";
    process.env.NOTIFICATIONS_EMAIL = "fallback@example.com";
    channelData.value = {
      id: "channel-1",
      name: "Main channel",
      notifications: {
        email: "ops@example.com",
        emails: ["secondary@example.com"],
      },
    };
    orderData.value = {
      id: "order-1",
      items: [
        {
          id: "item-1",
          name: "Business cards",
          product: { name: "Premium business cards" },
        },
      ],
      number: 101,
    };
    mocks.getAuthenticatedAdminMember.mockResolvedValue({
      id: "member-1",
      name: "Admin Member",
    });
    mocks.getTenantContextForRequest.mockResolvedValue({
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    });
    mocks.orderItemProblemNotification.mockReturnValue("item-problem-email");
    mocks.requireTenantAdminChannelAccess.mockResolvedValue("channel-1");
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it("sends to the channel default notification email when it exists", async () => {
    await expect(
      sendOrderItemProblemNotification({
        channelId: "channel-1",
        description: "Missing bleed",
        itemId: "item-1",
        orderId: "order-1",
      }),
    ).resolves.toEqual({ sent: true });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@example.com",
        subject: "Nowy problem pozycji zamowienia 101",
        template: "item-problem-email",
        to: "ops@example.com",
      }),
    );
    expect(mocks.orderItemProblemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        actorName: "Admin Member",
        description: "Missing bleed",
        itemName: "Premium business cards",
        url: "https://admin.example.com/orders/order-1?channelId=channel-1",
      }),
    );
  });

  it("does not use environment fallback or additional notification emails", async () => {
    channelData.value = {
      id: "channel-1",
      name: "Main channel",
      notifications: {
        emails: ["secondary@example.com"],
      },
    };

    await expect(
      sendOrderItemProblemNotification({
        channelId: "channel-1",
        description: "Missing bleed",
        itemId: "item-1",
        orderId: "order-1",
      }),
    ).resolves.toEqual({ sent: false, skipped: "email" });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("returns an error instead of throwing when email delivery fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.sendEmail.mockRejectedValue(new Error("Resend is not configured"));

    await expect(
      sendOrderItemProblemNotification({
        channelId: "channel-1",
        description: "Missing bleed",
        itemId: "item-1",
        orderId: "order-1",
      }),
    ).resolves.toEqual({
      error: "Resend is not configured",
      sent: false,
    });

    consoleErrorSpy.mockRestore();
  });
});
