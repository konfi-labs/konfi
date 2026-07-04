import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./request-origin";

describe("isSameOriginRequest", () => {
  it("should allow same-origin requests via origin header", () => {
    const headers = new Headers({
      origin: "https://admin.example.com",
      "sec-fetch-site": "same-origin",
    });

    expect(
      isSameOriginRequest({
        headers,
        requestOrigin: "https://admin.example.com",
      }),
    ).toBe(true);
  });

  it("should reject cross-site fetch metadata", () => {
    const headers = new Headers({
      origin: "https://admin.example.com",
      "sec-fetch-site": "cross-site",
    });

    expect(
      isSameOriginRequest({
        headers,
        requestOrigin: "https://admin.example.com",
      }),
    ).toBe(false);
  });

  it("should allow referers on the same origin", () => {
    const headers = new Headers({
      referer: "https://store.example.com/checkout",
    });

    expect(
      isSameOriginRequest({
        headers,
        requestOrigin: "https://store.example.com",
      }),
    ).toBe(true);
  });

  it("should reject invalid referers", () => {
    const headers = new Headers({
      referer: "not-a-url",
    });

    expect(
      isSameOriginRequest({
        headers,
        requestOrigin: "https://store.example.com",
      }),
    ).toBe(false);
  });

  it("should allow missing headers when explicitly enabled", () => {
    const headers = new Headers();

    expect(
      isSameOriginRequest({
        headers,
        requestOrigin: "https://store.example.com",
        allowMissingHeaders: true,
      }),
    ).toBe(true);
  });
});
