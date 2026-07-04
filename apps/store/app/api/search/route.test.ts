import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  mockIsSameOriginRequest: vi.fn(),
  mockStorefrontProductSearch: vi.fn(),
  mockVerifyAppCheckToken: vi.fn(),
}));

vi.mock("@konfi/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@konfi/utils")>("@konfi/utils");

  return {
    ...actual,
    isSameOriginRequest: mocks.mockIsSameOriginRequest,
  };
});

vi.mock("../../actions", () => ({
  storefrontProductSearch: mocks.mockStorefrontProductSearch,
}));

vi.mock("@/lib/firebase/config", () => ({
  firebaseConfig: {
    appId: "store-app-id",
  },
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  verifyAppCheckToken: mocks.mockVerifyAppCheckToken,
}));

let POST: (typeof import("./route"))["POST"];

function createRequest(body: unknown, headers?: HeadersInit) {
  return new NextRequest("https://store.example.com/api/search", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "https://store.example.com",
      ...headers,
    },
    method: "POST",
  });
}

describe("/api/search POST", () => {
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = "recaptcha-site-key";
    mocks.mockIsSameOriginRequest.mockReturnValue(true);
    mocks.mockStorefrontProductSearch.mockResolvedValue([
      {
        id: "product-1",
        name: "Product",
        slug: "product",
      },
    ]);
    mocks.mockVerifyAppCheckToken.mockResolvedValue({
      appId: "store-app-id",
    });
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = recaptchaSiteKey;
  });

  it("rejects non same-origin requests before checking App Check", async () => {
    mocks.mockIsSameOriginRequest.mockReturnValue(false);

    const response = await POST(
      createRequest({ channelId: "channel-1", lng: "en", query: "cards" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.mockVerifyAppCheckToken).not.toHaveBeenCalled();
    expect(mocks.mockStorefrontProductSearch).not.toHaveBeenCalled();
  });

  it("rejects requests without an App Check token", async () => {
    const response = await POST(
      createRequest({ channelId: "channel-1", lng: "en", query: "cards" }),
    );

    expect(response.status).toBe(401);
    expect(mocks.mockVerifyAppCheckToken).not.toHaveBeenCalled();
    expect(mocks.mockStorefrontProductSearch).not.toHaveBeenCalled();
  });

  it("rejects invalid App Check tokens", async () => {
    mocks.mockVerifyAppCheckToken.mockResolvedValue(null);

    const response = await POST(
      createRequest(
        { channelId: "channel-1", lng: "en", query: "cards" },
        { "x-firebase-appcheck": "invalid-token" },
      ),
    );

    expect(response.status).toBe(401);
    expect(mocks.mockVerifyAppCheckToken).toHaveBeenCalledWith("invalid-token");
    expect(mocks.mockStorefrontProductSearch).not.toHaveBeenCalled();
  });

  it("rejects App Check tokens for a different Firebase app", async () => {
    mocks.mockVerifyAppCheckToken.mockResolvedValue({
      appId: "other-app-id",
    });

    const response = await POST(
      createRequest(
        { channelId: "channel-1", lng: "en", query: "cards" },
        { "x-firebase-appcheck": "valid-token" },
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.mockStorefrontProductSearch).not.toHaveBeenCalled();
  });

  it("passes a verified App Check token to search", async () => {
    const response = await POST(
      createRequest(
        { channelId: "channel-1", lng: "en", query: "cards" },
        { "x-firebase-appcheck": "valid-token" },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: "product-1",
        name: "Product",
        slug: "product",
      },
    ]);
    expect(mocks.mockStorefrontProductSearch).toHaveBeenCalledWith(
      "valid-token",
      "en",
      "cards",
      "channel-1",
    );
  });
});
