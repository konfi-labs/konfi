import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationType } from "@konfi/types";

vi.mock("server-only", () => ({}));

const {
  mockChannelGet,
  mockGetResendConfig,
  mockNotificationSet,
  mockSendEmail,
} = vi.hoisted(() => ({
  mockChannelGet: vi.fn(),
  mockGetResendConfig: vi.fn(),
  mockNotificationSet: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("../email", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("../resend/client", () => ({
  getResendConfig: mockGetResendConfig,
}));

vi.mock("../notifications/push", () => ({
  publishNotificationPush: vi.fn(),
}));

vi.mock("../firebase/serverApp", () => ({
  getAdminDb: () => ({
    collection: (name: string) => {
      if (name === "channels") {
        return {
          doc: () => ({
            get: mockChannelGet,
          }),
        };
      }

      if (name === "notifications") {
        return {
          doc: () => ({
            id: "notification-1",
            set: mockNotificationSet,
          }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  }),
}));

vi.mock("@konfi/payments", () => ({
  getAdminBaseUrl: () => "https://admin.example.com",
}));

import { sendNewOrderNotifications } from "./new-order-notifications";

const saasContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} as const;

const dedicatedContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
} as const;

function createOrder(
  overrides: Partial<Parameters<typeof sendNewOrderNotifications>[0]> = {},
) {
  return {
    id: "order-1",
    number: 123,
    channelId: "channel-1",
    contact: {
      email: "customer@example.com",
    },
    customer: "Example Customer",
    checkoutSession: {
      url: "https://checkout.example.com/session",
    },
    tenantId: "tenant-a",
    ...overrides,
  };
}

function mockChannel(data: Record<string, unknown>) {
  mockChannelGet.mockResolvedValue({
    data: () => data,
  });
}

describe("sendNewOrderNotifications", () => {
  beforeEach(() => {
    vi.stubEnv("NO_REPLY_EMAIL", "noreply@example.com");
    vi.stubEnv("NOTIFICATIONS_EMAIL", "fallback@example.com");
    vi.stubEnv("RESEND_NEW_ORDER_CUSTOMER_TEMPLATE_ID", "tpl_customer");
    vi.stubEnv("RESEND_NEW_ORDER_ADMIN_TEMPLATE_ID", "tpl_admin");

    mockNotificationSet.mockReset();
    mockNotificationSet.mockResolvedValue(undefined);
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue(undefined);
    mockGetResendConfig.mockReset();
    mockGetResendConfig.mockResolvedValue({
      apiKey: "tenant-resend-key",
      fromEmail: "noreply@tenant.example",
    });
    mockChannelGet.mockReset();
    mockChannel({
      name: "Sklep",
      notifications: {
        enabledTypes: [NotificationType.STORE_ORDER_CREATED],
        emails: ["ops@example.com"],
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates the admin notification and sends customer plus channel admin emails with tenant config", async () => {
    const order = createOrder();

    await sendNewOrderNotifications(order, { tenantContext: saasContext });

    expect(mockNotificationSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Nowe zamówienie",
        channelId: "channel-1",
        tenantId: "tenant-a",
        url: "/orders/order-1",
      }),
    );
    expect(mockGetResendConfig).toHaveBeenCalledWith(saasContext);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "customer@example.com",
        subject: "Nowe zamówienie",
        tenantContext: saasContext,
        fallbackTemplate: {
          id: "tpl_customer",
          variables: {
            name: "Example Customer",
            orderNumber: "123",
            url: "https://checkout.example.com/session",
          },
        },
      }),
    );
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: "ops@example.com",
        subject: "Nowe zamówienie",
        tenantContext: saasContext,
        fallbackTemplate: {
          id: "tpl_admin",
          variables: {
            channelName: "Sklep",
            orderNumber: "123",
            url: "https://admin.example.com/orders/order-1?channelId=channel-1",
          },
        },
      }),
    );
    expect(mockSendEmail.mock.calls[0]?.[0]).not.toHaveProperty("from");
    expect(mockSendEmail.mock.calls[1]?.[0]).not.toHaveProperty("from");
  });

  it("creates the app notification but sends no emails when tenant Resend is missing", async () => {
    mockGetResendConfig.mockRejectedValue(
      new Error("Resend is not configured for this tenant."),
    );

    await sendNewOrderNotifications(createOrder(), {
      tenantContext: saasContext,
    });

    expect(mockNotificationSet).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not use NOTIFICATIONS_EMAIL as a fallback in SaaS mode", async () => {
    mockChannel({
      name: "Sklep",
      notifications: {
        enabledTypes: [NotificationType.STORE_ORDER_CREATED],
        emails: [],
      },
    });

    await sendNewOrderNotifications(createOrder(), {
      tenantContext: saasContext,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "customer@example.com",
      }),
    );
    expect(mockSendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({
        to: "fallback@example.com",
      }),
    );
  });

  it("keeps NOTIFICATIONS_EMAIL fallback in dedicated mode", async () => {
    mockGetResendConfig.mockResolvedValue({
      apiKey: "platform-resend-key",
      fromEmail: "noreply@example.com",
    });
    mockChannel({
      name: "Sklep",
      notifications: {
        enabledTypes: [NotificationType.STORE_ORDER_CREATED],
        emails: [],
      },
    });

    await sendNewOrderNotifications(createOrder({ tenantId: undefined }), {
      tenantContext: dedicatedContext,
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@example.com",
        to: "fallback@example.com",
      }),
    );
  });

  it("skips only the customer email when the order has no contact email", async () => {
    await sendNewOrderNotifications(
      createOrder({
        contact: {},
      }),
      { tenantContext: saasContext },
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ops@example.com",
      }),
    );
  });

  it("skips admin emails when store order notifications are disabled", async () => {
    mockChannel({
      name: "Sklep",
      notifications: {
        enabledTypes: [],
        emails: ["ops@example.com"],
      },
    });

    await sendNewOrderNotifications(createOrder(), {
      tenantContext: saasContext,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "customer@example.com",
      }),
    );
  });
});
