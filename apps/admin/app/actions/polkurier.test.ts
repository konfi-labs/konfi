import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/polkurier/client", () => ({
  getPolkurierAuthorization: vi.fn(() => ({
    login: "test-login",
    token: "test-token",
  })),
  postPolkurierEnvelope: vi.fn(),
  postPolkurierRawEnvelope: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getFirebaseAdminApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
}));

vi.mock("./index", () => ({
  checkAdmin: vi.fn(),
  checkPolkurierEnv: vi.fn(),
  getAdminConfigFlags: vi.fn(),
}));

import { postPolkurierRawEnvelope } from "@/lib/polkurier/client";
import { getCourierPoints } from "./polkurier";

const mockedPostPolkurierRawEnvelope = vi.mocked(postPolkurierRawEnvelope);

describe("getCourierPoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses numeric-keyed raw point responses", async () => {
    mockedPostPolkurierRawEnvelope.mockResolvedValueOnce({
      status: "success",
      response: {
        "0": {
          id: "P1",
          name: "Point 1",
          city: "Warszawa",
          zip: "00-001",
          street: "Main 1",
          collect: true,
          functions: ["collect"],
        },
        "1": {
          point_id: "P2",
          name: "Point 2",
          city: "Warszawa",
          post_code: "00-002",
          location: "Second 2",
          collect: "1",
          functions: ["collect", "cod"],
        },
      },
    });

    const result = await getCourierPoints({
      courier: "INPOST_PACZKOMAT",
      functions: ["collect"],
      limit: 50,
      searchQuery: "Warszawa",
    });

    expect(result.success).toBe(true);
    expect(result.points).toEqual([
      expect.objectContaining({
        id: "P1",
        name: "Point 1",
        city: "Warszawa",
        zip: "00-001",
        address: "00-001 Warszawa, Main 1",
        collect: true,
      }),
      expect.objectContaining({
        id: "P2",
        name: "Point 2",
        city: "Warszawa",
        zip: "00-002",
        address: "Second 2",
        collect: true,
      }),
    ]);
  });

  it("retries without function filters when the first lookup is empty", async () => {
    mockedPostPolkurierRawEnvelope
      .mockResolvedValueOnce({
        status: "success",
        response: [],
      })
      .mockResolvedValueOnce({
        status: "success",
        response: [
          {
            id: "DPD1",
            name: "DPD Pickup",
            city: "Warszawa",
            send: true,
          },
        ],
      });

    const result = await getCourierPoints({
      courier: "DPD_PICKUP",
      functions: ["send"],
      searchQuery: "Warszawa",
    });

    expect(result.points).toEqual([
      expect.objectContaining({
        id: "DPD1",
        name: "DPD Pickup",
        send: true,
      }),
    ]);
    expect(mockedPostPolkurierRawEnvelope).toHaveBeenCalledTimes(2);
    expect(mockedPostPolkurierRawEnvelope.mock.calls[0]?.[0]).toMatchObject({
      apimethod: "get_courier_point",
      data: expect.objectContaining({
        couriers: ["DPD_PICKUP"],
        functions: ["send"],
        searchquery: "Warszawa",
      }),
    });
    expect(mockedPostPolkurierRawEnvelope.mock.calls[1]?.[0]).toMatchObject({
      apimethod: "get_courier_point",
      data: expect.objectContaining({
        couriers: ["DPD_PICKUP"],
        searchquery: "Warszawa",
      }),
    });
    expect(
      mockedPostPolkurierRawEnvelope.mock.calls[1]?.[0]?.data?.functions,
    ).toBeUndefined();
  });

  it("falls back to inpost parcel machines for locker lookups", async () => {
    mockedPostPolkurierRawEnvelope
      .mockResolvedValueOnce({
        status: "success",
        response: [],
      })
      .mockResolvedValueOnce({
        status: "success",
        response: [],
      })
      .mockResolvedValueOnce({
        status: "success",
        response: [
          {
            name: "WAW123",
            city: "Warszawa",
            post_code: "00-001",
            location: "Marszalkowska 1",
            latitude: "52.2297",
            longitude: "21.0122",
          },
        ],
      });

    const result = await getCourierPoints({
      courier: "INPOST_PACZKOMAT",
      functions: ["collect"],
      searchQuery: "Warszawa",
    });

    expect(result.points).toEqual([
      expect.objectContaining({
        id: "WAW123",
        name: "WAW123",
        city: "Warszawa",
        zip: "00-001",
        address: "Marszalkowska 1",
        latitude: 52.2297,
        longitude: 21.0122,
        provider: "INPOST_PACZKOMAT",
      }),
    ]);
    expect(mockedPostPolkurierRawEnvelope).toHaveBeenCalledTimes(3);
    expect(mockedPostPolkurierRawEnvelope.mock.calls[2]?.[0]).toMatchObject({
      apimethod: "inpost_parcel_machines",
      data: {
        city: "Warszawa",
      },
    });
  });
});
