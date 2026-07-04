import { describe, expect, it, vi } from "vitest";
import {
  fetchExternalProviderUrl,
  type ProviderFetch,
  type ProviderUrlResolver,
  validateExternalProviderUrl,
} from "./provider-url-policy";

vi.mock("server-only", () => ({}));

const publicResolver: ProviderUrlResolver = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("validateExternalProviderUrl", () => {
  it("allows public HTTPS provider URLs", async () => {
    await expect(
      validateExternalProviderUrl("https://supplier.example/products?id=123", {
        resolver: publicResolver,
      }),
    ).resolves.toMatchObject({
      href: "https://supplier.example/products?id=123",
    });
  });

  it("rejects localhost before DNS resolution", async () => {
    const resolver = vi.fn<ProviderUrlResolver>(async () => [
      { address: "93.184.216.34", family: 4 },
    ]);

    await expect(
      validateExternalProviderUrl("https://localhost/products", {
        resolver,
      }),
    ).rejects.toThrow(/local hostname/i);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects local and metadata hostnames before DNS resolution", async () => {
    const resolver = vi.fn<ProviderUrlResolver>(async () => [
      { address: "93.184.216.34", family: 4 },
    ]);

    await expect(
      validateExternalProviderUrl("https://printer.local/products", {
        resolver,
      }),
    ).rejects.toThrow(/local hostname/i);

    await expect(
      validateExternalProviderUrl(
        "https://metadata.google.internal/computeMetadata/v1",
        {
          resolver,
        },
      ),
    ).rejects.toThrow(/local hostname/i);

    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects private resolved IPv4 addresses", async () => {
    await expect(
      validateExternalProviderUrl("https://supplier.example/products", {
        resolver: async () => [{ address: "10.0.0.4", family: 4 }],
      }),
    ).rejects.toThrow(/non-public address/i);
  });

  it("rejects cloud metadata IPv4 addresses", async () => {
    await expect(
      validateExternalProviderUrl("https://169.254.169.254/latest/meta-data"),
    ).rejects.toThrow(/non-public address/i);

    await expect(
      validateExternalProviderUrl("https://168.63.129.16/metadata"),
    ).rejects.toThrow(/non-public address/i);
  });

  it("rejects other non-public IPv4 ranges", async () => {
    await expect(
      validateExternalProviderUrl("https://supplier.example/products", {
        resolver: async () => [{ address: "100.64.0.1", family: 4 }],
      }),
    ).rejects.toThrow(/non-public address/i);

    await expect(
      validateExternalProviderUrl("https://supplier.example/products", {
        resolver: async () => [{ address: "198.18.0.1", family: 4 }],
      }),
    ).rejects.toThrow(/non-public address/i);
  });

  it("rejects unique-local and link-local IPv6 addresses", async () => {
    await expect(
      validateExternalProviderUrl("https://[fd00::1]/"),
    ).rejects.toThrow(/non-public address/i);

    await expect(
      validateExternalProviderUrl("https://[fe80::1]/"),
    ).rejects.toThrow(/non-public address/i);
  });

  it("rejects non-HTTPS provider URLs by default", async () => {
    await expect(
      validateExternalProviderUrl("http://supplier.example/products", {
        resolver: publicResolver,
      }),
    ).rejects.toThrow(/HTTPS/i);
  });
});

describe("fetchExternalProviderUrl", () => {
  it("rejects blocked redirect targets before following them", async () => {
    let requestCount = 0;
    const fetchImpl: ProviderFetch = async () => {
      requestCount += 1;

      return new Response(null, {
        status: 302,
        headers: {
          location: "https://169.254.169.254/latest/meta-data",
        },
      });
    };

    await expect(
      fetchExternalProviderUrl("https://supplier.example/products", undefined, {
        fetchImpl,
        resolver: publicResolver,
      }),
    ).rejects.toThrow(/non-public address/i);
    expect(requestCount).toBe(1);
  });

  it("validates public same-origin redirects before following them", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl: ProviderFetch = async (input) => {
      const url = input.toString();
      requestedUrls.push(url);

      if (url.endsWith("/products")) {
        return new Response(null, {
          status: 302,
          headers: {
            location: "/products?page=2",
          },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    };

    const response = await fetchExternalProviderUrl(
      "https://supplier.example/products",
      undefined,
      {
        fetchImpl,
        resolver: publicResolver,
      },
    );

    expect(response.status).toBe(200);
    expect(requestedUrls).toEqual([
      "https://supplier.example/products",
      "https://supplier.example/products?page=2",
    ]);
  });
});
