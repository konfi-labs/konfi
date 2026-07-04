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
  mockGetGooglePlaceAddressPredictions: vi.fn(),
  mockGetTenantContextForRequest: vi.fn(),
  mockResolveGooglePlaceRegionCode: vi.fn(),
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
  getGooglePlaceAddressPredictions: mocks.mockGetGooglePlaceAddressPredictions,
  resolveGooglePlaceRegionCode: mocks.mockResolveGooglePlaceRegionCode,
}));

let POST: (typeof import("./route"))["POST"];

function createRequest(body: unknown) {
  return new NextRequest(
    "https://admin.example.com/api/google/places/autocomplete",
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

describe("/api/google/places/autocomplete admin POST", () => {
  const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;

  beforeAll(async () => {
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = "central-key";
    mocks.mockGetGooglePlaceAddressPredictions.mockResolvedValue([
      {
        placeId: "place-1",
        text: "Main Street",
      },
    ]);
    mocks.mockGetTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
      tenantId: "tenant-1",
    });
    mocks.mockResolveGooglePlaceRegionCode.mockImplementation(
      (country: string | undefined) => country?.toUpperCase(),
    );
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
        input: "Main",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.mockGetTenantContextForRequest).not.toHaveBeenCalled();
    expect(mocks.mockGetGooglePlaceAddressPredictions).not.toHaveBeenCalled();
  });

  it("rejects unresolved SaaS tenant context before checking the key", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "";
    mocks.mockGetTenantContextForRequest.mockResolvedValue({
      deploymentMode: "saas",
      requireTenantId: true,
    });

    const response = await POST(
      createRequest({
        input: "Main",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.mockGetGooglePlaceAddressPredictions).not.toHaveBeenCalled();
  });

  it("requires the central Places key after tenant context resolves", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "";

    const response = await POST(
      createRequest({
        input: "Main",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "GOOGLE_PLACES_API_KEY is not configured.",
    });
    expect(mocks.mockGetTenantContextForRequest).toHaveBeenCalledTimes(1);
    expect(mocks.mockGetGooglePlaceAddressPredictions).not.toHaveBeenCalled();
  });

  it("uses the server-only central Places key", async () => {
    const response = await POST(
      createRequest({
        country: "pl",
        input: "Main",
        languageCode: "en",
        sessionToken: "session-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      suggestions: [
        {
          placeId: "place-1",
          text: "Main Street",
        },
      ],
    });
    expect(mocks.mockGetGooglePlaceAddressPredictions).toHaveBeenCalledWith({
      apiKey: "central-key",
      countryCode: "PL",
      input: "Main",
      languageCode: "en",
      sessionToken: "session-1",
    });
  });

  it("rejects session tokens that Google Places would reject", async () => {
    const response = await POST(
      createRequest({
        input: "Main",
        sessionToken: "x".repeat(37),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid session token.",
    });
    expect(mocks.mockGetGooglePlaceAddressPredictions).not.toHaveBeenCalled();
  });
});
