import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

const { mockGusLookupPost } = vi.hoisted(() => ({
  mockGusLookupPost: vi.fn(),
}));

const { mockClientsGet } = vi.hoisted(() => ({
  mockClientsGet: vi.fn(),
}));

vi.mock("@/lib/fakturownia/client", () => ({
  getFakturowniaClient: vi.fn(() => ({
    clientsJson: {
      get: mockClientsGet,
    },
    clients: {
      gus_dataJson: {
        post: mockGusLookupPost,
      },
    },
  })),
}));

let lookupCustomerDataByNip: (typeof import("./lookup"))["lookupCustomerDataByNip"];
let lookupFakturowniaCustomerDescriptionsByNip: (typeof import("./lookup"))["lookupFakturowniaCustomerDescriptionsByNip"];

describe("lookupCustomerDataByNip", () => {
  beforeAll(async () => {
    ({ lookupCustomerDataByNip, lookupFakturowniaCustomerDescriptionsByNip } =
      await import("./lookup"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FAKTUROWNIA_API_KEY", "test-api-key");
    vi.stubEnv("FAKTUROWNIA_SUBDOMAIN", "test-subdomain");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("prefers an existing Fakturownia client when one exact NIP match exists", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    mockClientsGet.mockResolvedValue([
      {
        id: 12,
        name: "Example Saved Client",
        taxNo: "0000000000",
        street: "Example Street 1",
        postCode: "00-000",
        city: "Example City",
        email: "saved@example.com",
        note: "Use invoice note from Fakturownia",
      },
    ]);

    const result = await lookupCustomerDataByNip("000-000-00-00");

    expect(mockClientsGet).toHaveBeenCalledWith({
      queryParameters: {
        taxNo: "0000000000",
      },
    });
    expect(mockGusLookupPost).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      source: "fakturownia-client",
      subject: {
        description: "Use invoice note from Fakturownia",
        name: "Example Saved Client",
        nip: "0000000000",
        workingAddress: "Example Street 1, 00-000 Example City",
      },
    });
  });

  it("returns multiple exact Fakturownia clients for user selection", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    mockClientsGet.mockResolvedValue([
      {
        id: 12,
        name: "Example Saved Client",
        taxNo: "0000000000",
        street: "Example Street 1",
        postCode: "00-000",
        city: "Example City",
        email: "saved@example.com",
        note: "Main client description",
      },
      {
        id: 19,
        name: "Example Warehouse",
        taxNo: "000-000-00-00",
        street: "Example Avenue 2",
        postCode: "00-001",
        city: "Example City",
      },
    ]);

    const result = await lookupCustomerDataByNip("0000000000");

    expect(mockGusLookupPost).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      source: "fakturownia-client",
      matches: [
        {
          email: "saved@example.com",
          id: "12",
          subject: {
            description: "Main client description",
            name: "Example Saved Client",
            nip: "0000000000",
            workingAddress: "Example Street 1, 00-000 Example City",
          },
        },
        {
          email: undefined,
          id: "19",
          subject: {
            name: "Example Warehouse",
            nip: "000-000-00-00",
            workingAddress: "Example Avenue 2, 00-001 Example City",
          },
        },
      ],
      subject: null,
    });
  });

  it("falls back to Fakturownia GUS when no existing Fakturownia client matches", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    mockClientsGet.mockResolvedValue([
      {
        id: 77,
        name: "Other Client",
        taxNo: "9999999999",
      },
    ]);
    mockGusLookupPost.mockResolvedValue({
      results: {
        name: "Example Company Sp. z o.o.",
        nip: "0000000000",
        regon: "000000000",
        street: "Example Street 1",
        postCode: "00-000",
        city: "Example City",
      },
      errors: [],
      notices: [],
    });

    const result = await lookupCustomerDataByNip("000-000-00-00");

    expect(mockClientsGet).toHaveBeenCalledWith({
      queryParameters: {
        taxNo: "0000000000",
      },
    });
    expect(mockGusLookupPost).toHaveBeenCalledWith({
      code: "",
      mode: "",
      numer: "0000000000",
      type: "nip",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      source: "fakturownia-gus",
      subject: {
        name: "Example Company Sp. z o.o.",
        nip: "0000000000",
        regon: "000000000",
        workingAddress: "Example Street 1, 00-000 Example City",
      },
      errors: undefined,
      notices: undefined,
    });
  });

  it("falls back to WL when Fakturownia does not return a subject", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          subject: {
            name: "WL Example Company",
            nip: "0000000000",
            workingAddress: "Example Avenue 2, 00-001 Example City",
          },
        },
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    mockClientsGet.mockResolvedValue([]);
    mockGusLookupPost.mockResolvedValue({
      results: {},
      errors: ["Nie znaleziono danych w GUS"],
      notices: [],
    });

    const result = await lookupCustomerDataByNip("0000000000");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://wl-api.mf.gov.pl/api/search/nip/0000000000",
      ),
      {
        cache: "no-store",
      },
    );
    expect(result).toEqual({
      source: "wl",
      subject: {
        name: "WL Example Company",
        nip: "0000000000",
        workingAddress: "Example Avenue 2, 00-001 Example City",
      },
    });
  });

  it("keeps Fakturownia validation errors when both providers return no subject", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          subject: null,
        },
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);
    mockClientsGet.mockResolvedValue([]);
    mockGusLookupPost.mockResolvedValue({
      results: {},
      errors: ["Wprowadzono nieprawidłowy numer NIP"],
      notices: [],
    });

    const result = await lookupCustomerDataByNip("0000000000");

    expect(result).toEqual({
      source: "fakturownia-gus",
      subject: null,
      errors: ["Wprowadzono nieprawidłowy numer NIP"],
      notices: undefined,
    });
  });

  it("looks up only Fakturownia customer descriptions by NIP", async () => {
    mockClientsGet.mockResolvedValue([
      {
        id: 12,
        name: "Example Saved Client",
        taxNo: "0000000000",
        note: "First Fakturownia note",
      },
      {
        id: 19,
        name: "Example Warehouse",
        taxNo: "000-000-00-00",
        note: "Second Fakturownia note",
      },
      {
        id: 44,
        name: "Other Client",
        taxNo: "9999999999",
        note: "Other note",
      },
    ]);

    const result =
      await lookupFakturowniaCustomerDescriptionsByNip("000-000-00-00");

    expect(mockClientsGet).toHaveBeenCalledWith({
      queryParameters: {
        taxNo: "0000000000",
      },
    });
    expect(mockGusLookupPost).not.toHaveBeenCalled();
    expect(result).toEqual({
      source: "fakturownia-client",
      descriptions: ["First Fakturownia note", "Second Fakturownia note"],
    });
  });
});
