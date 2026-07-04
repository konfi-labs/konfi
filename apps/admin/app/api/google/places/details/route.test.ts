import { NextRequest, NextResponse } from "next/server";
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
  mockGetGooglePlaceAddressDetails: vi.fn(),
  mockGetTenantContextForRequest: vi.fn(),
  mockValidateAdminPlacesRequest: vi.fn(),
}));

vi.mock("@/lib/google/places-route-security", () => ({
  validateAdminPlacesRequest: mocks.mockValidateAdminPlacesRequest,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getTenantContextForRequest: mocks.mockGetTenantContextForRequest,
}));

vi.mock("@konfi/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@konfi/google")>()),
  getGooglePlaceAddressDetails: mocks.mockGetGooglePlaceAddressDetails,
}));

let POST: (typeof import("./route"))["POST"];

function createRequest(body: unknown) {
  return new NextRequest(
    "https://admin.example.com/api/google/places/details",
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        origin: "https://admin.example.com",
      },
      method: "POST",
    },
  );
}

describe("/api/google/places/details admin POST", () => {
  const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;

  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = "central-key";
    mocks.mockGetGooglePlaceAddressDetails.mockResolvedValue({
      city: "Warsaw",
      formattedAddress: "Main Street",
    });
    mocks.mockGetTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-1",
    });
    mocks.mockValidateAdminPlacesRequest.mockResolvedValue(null);
  });

  afterAll(() => {
    process.env.GOOGLE_PLACES_API_KEY = placesApiKey;
  });

  it("keeps same-origin and admin auth validation first", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "";
    mocks.mockValidateAdminPlacesRequest.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(
      createRequest({
        placeId: "place-1",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.mockGetTenantContextForRequest).not.toHaveBeenCalled();
    expect(mocks.mockGetGooglePlaceAddressDetails).not.toHaveBeenCalled();
  });

  it("rejects unresolved SaaS tenant context before checking the key", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "";
    mocks.mockGetTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
    });

    const response = await POST(
      createRequest({
        placeId: "place-1",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.mockGetGooglePlaceAddressDetails).not.toHaveBeenCalled();
  });

  it("requires the central Places key after tenant context resolves", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "";

    const response = await POST(
      createRequest({
        placeId: "place-1",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "GOOGLE_PLACES_API_KEY is not configured.",
    });
    expect(mocks.mockGetTenantContextForRequest).toHaveBeenCalledTimes(1);
    expect(mocks.mockGetGooglePlaceAddressDetails).not.toHaveBeenCalled();
  });

  it("uses the server-only central Places key", async () => {
    const response = await POST(
      createRequest({
        languageCode: "en",
        placeId: "place-1",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      address: {
        city: "Warsaw",
        formattedAddress: "Main Street",
      },
    });
    expect(mocks.mockGetGooglePlaceAddressDetails).toHaveBeenCalledWith({
      apiKey: "central-key",
      languageCode: "en",
      placeId: "place-1",
      sessionToken: "session-1",
    });
  });

  it("rejects session tokens that Google Places would reject", async () => {
    const response = await POST(
      createRequest({
        placeId: "place-1",
        sessionToken: "x".repeat(37),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid session token.",
    });
    expect(mocks.mockGetGooglePlaceAddressDetails).not.toHaveBeenCalled();
  });
});
