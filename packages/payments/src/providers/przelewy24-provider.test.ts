import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPrzelewy24CheckoutSession,
  getPrzelewy24TransactionBySessionId,
  refundPrzelewy24Payment,
} from "./przelewy24-provider";

describe("createPrzelewy24CheckoutSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("PRZELEWY24_POS_ID", "123456");
    vi.stubEnv("PRZELEWY24_API_KEY", "prod-key");
    vi.stubEnv("PRZELEWY24_API_KEY_DEV", "dev-key");
    vi.stubEnv("PRZELEWY24_CRC", "prod-crc");
    vi.stubEnv("PRZELEWY24_CRC_DEV", "dev-crc");
    vi.stubEnv("STORE_URL", "https://store.example.com");
    vi.stubEnv("ADMIN_URL", "https://admin.example.com");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "https://admin.example.com");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("uses the admin webhook route for new Przelewy24 registrations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        data: {
          token: "p24_token",
        },
      }),
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const session = await createPrzelewy24CheckoutSession(
      false,
      12300,
      "jan@example.com",
      "channels/channel-1/orders/order-1",
    );

    expect(session.url).toContain("secure.przelewy24.pl/trnRequest/p24_token");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body)) as {
      urlStatus: string;
      urlReturn: string;
    };

    expect(body.urlStatus).toBe(
      "https://admin.example.com/api/payments/przelewy24/webhook",
    );
    expect(body.urlReturn).toBe("https://store.example.com/pl/account/orders");
  });

  it("uses runtime store and admin URLs when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        data: {
          token: "p24_token",
        },
      }),
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await createPrzelewy24CheckoutSession(
      false,
      12300,
      "jan@example.com",
      "channels/channel-1/orders/order-1",
      {
        adminBaseUrl: "tenant-admin.example.com",
        storeBaseUrl: "tenant-store.example.com",
      },
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body)) as {
      urlStatus: string;
      urlReturn: string;
    };

    expect(body.urlStatus).toBe(
      "https://tenant-admin.example.com/api/payments/przelewy24/webhook",
    );
    expect(body.urlReturn).toBe(
      "https://tenant-store.example.com/pl/account/orders",
    );
  });

  it("uses the same unified admin webhook route for sandbox registrations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        data: {
          token: "p24_token_sandbox",
        },
      }),
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const session = await createPrzelewy24CheckoutSession(
      true,
      12300,
      "jan@example.com",
      "channels/channel-1/orders/order-1",
    );

    expect(session.url).toContain(
      "sandbox.przelewy24.pl/trnRequest/p24_token_sandbox",
    );

    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body)) as {
      urlStatus: string;
    };

    expect(url).toContain("sandbox.przelewy24.pl/api/v1/transaction/register");
    expect(body.urlStatus).toBe(
      "https://admin.example.com/api/payments/przelewy24/webhook",
    );
  });

  it("throws when the admin webhook base URL is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("PRZELEWY24_POS_ID", "123456");
    vi.stubEnv("PRZELEWY24_API_KEY", "prod-key");
    vi.stubEnv("PRZELEWY24_API_KEY_DEV", "dev-key");
    vi.stubEnv("PRZELEWY24_CRC", "prod-crc");
    vi.stubEnv("PRZELEWY24_CRC_DEV", "dev-crc");
    vi.stubEnv("STORE_URL", "https://store.example.com");
    vi.stubEnv("ADMIN_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "");

    await expect(
      createPrzelewy24CheckoutSession(
        false,
        12300,
        "jan@example.com",
        "channels/channel-1/orders/order-1",
      ),
    ).rejects.toThrow("ADMIN_URL or NEXT_PUBLIC_ADMIN_URL is not defined");
  });

  it("throws when registration returns a non-OK Przelewy24 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: vi.fn().mockResolvedValue({
        error: "Invalid credentials",
        code: 401,
      }),
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      createPrzelewy24CheckoutSession(
        false,
        12300,
        "jan@example.com",
        "channels/channel-1/orders/order-1",
      ),
    ).rejects.toThrow(
      "Przelewy24 transaction register failed: Invalid credentials (Code: 401)",
    );
  });
});

describe("refundPrzelewy24Payment", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("PRZELEWY24_POS_ID", "123456");
    vi.stubEnv("PRZELEWY24_API_KEY", "prod-key");
    vi.stubEnv("PRZELEWY24_CRC", "prod-crc");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("looks up the transaction by session id before creating a refund", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            orderId: 987654,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            refundsUuid: "refund_uuid",
            status: "success",
          },
        }),
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await refundPrzelewy24Payment({
      isTest: false,
      sessionId: "channels/channel-1/orders/order-1",
      amount: 12300,
      description: "Refund requested by admin",
      requestId: "refund-request-1",
    });

    expect(result).toEqual({
      refundsUuid: "refund_uuid",
      status: "success",
      orderId: 987654,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/api/v1/transaction/by/sessionId/channels%2Fchannel-1%2Forders%2Forder-1",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      "/api/v1/transaction/refund",
    );
  });
});

describe("getPrzelewy24TransactionBySessionId", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("PRZELEWY24_POS_ID", "123456");
    vi.stubEnv("PRZELEWY24_API_KEY", "prod-key");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns the transaction details from the Przelewy24 API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          orderId: 987654,
          sessionId: "channels/channel-1/orders/order-1",
          statement: "P24-REF-123",
          amount: 12300,
          currency: "PLN",
          dateOfTransaction: "2026-04-12T10:20:30Z",
          clientEmail: "buyer@example.com",
        },
      }),
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await getPrzelewy24TransactionBySessionId({
      isTest: false,
      sessionId: "channels/channel-1/orders/order-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/api/v1/transaction/by/sessionId/channels%2Fchannel-1%2Forders%2Forder-1",
    );
    expect(result).toEqual({
      orderId: 987654,
      sessionId: "channels/channel-1/orders/order-1",
      statement: "P24-REF-123",
      amount: 12300,
      currency: "PLN",
      dateOfTransaction: "2026-04-12T10:20:30Z",
      clientEmail: "buyer@example.com",
    });
  });

  it("throws when transaction lookup returns non-JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token <")),
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      getPrzelewy24TransactionBySessionId({
        isTest: false,
        sessionId: "channels/channel-1/orders/order-1",
      }),
    ).rejects.toThrow(
      "Przelewy24 transaction lookup failed: Bad Gateway (Code: 502)",
    );
  });
});
