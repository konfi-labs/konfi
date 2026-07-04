import { describe, expect, it } from "vitest";
import {
  buildRevalidateRouteUrl,
  buildRevalidateTagUrl,
  getRevalidateApiBaseUrl,
} from "./revalidate-cache.utils";

describe("revalidate cache URL helpers", () => {
  it("prefers the explicit frontend revalidate URL in production", () => {
    expect(
      getRevalidateApiBaseUrl({
        FRONTEND_REVALIDATE_URL: "https://www.example.com/api/revalidate",
        NEXT_PUBLIC_STORE_URL: "www.example.com",
        NODE_ENV: "production",
      }),
    ).toBe("https://www.example.com/api/revalidate");
  });

  it("normalizes protocol-less explicit frontend revalidate URLs", () => {
    expect(
      getRevalidateApiBaseUrl({
        FRONTEND_REVALIDATE_URL: "www.example.com/api/revalidate",
        NODE_ENV: "production",
      }),
    ).toBe("https://www.example.com/api/revalidate");
  });

  it("builds the revalidate endpoint from STORE_URL when no explicit URL is set", () => {
    expect(
      buildRevalidateTagUrl("categorizedCardProducts", {
        NODE_ENV: "production",
        STORE_URL: "https://www.example.com/",
      }),
    ).toBe("https://www.example.com/api/revalidate/categorizedCardProducts");
  });

  it("keeps subpaths when deriving the revalidate endpoint from STORE_URL", () => {
    expect(
      buildRevalidateTagUrl("categorizedCardProducts", {
        NODE_ENV: "production",
        STORE_URL: "https://www.example.com/shop/",
      }),
    ).toBe(
      "https://www.example.com/shop/api/revalidate/categorizedCardProducts",
    );
  });

  it("normalizes protocol-less public store URLs for server-side fetches", () => {
    expect(
      buildRevalidateTagUrl("popularProducts", {
        NODE_ENV: "production",
        NEXT_PUBLIC_STORE_URL: "www.example.com",
      }),
    ).toBe("https://www.example.com/api/revalidate/popularProducts");
  });

  it("falls back to NEXT_PUBLIC_STORE_URL when STORE_URL is blank", () => {
    expect(
      buildRevalidateTagUrl("products", {
        NEXT_PUBLIC_STORE_URL: "www.example.com",
        NODE_ENV: "production",
        STORE_URL: " ",
      }),
    ).toBe("https://www.example.com/api/revalidate/products");
  });

  it("adds encoded revalidation paths as query parameters", () => {
    expect(
      buildRevalidateRouteUrl("products", "/pl/products/some slug", {
        NODE_ENV: "production",
        STORE_URL: "https://www.example.com",
      }),
    ).toBe(
      "https://www.example.com/api/revalidate/products?path=%2Fpl%2Fproducts%2Fsome+slug",
    );
  });

  it("throws a consistent error when no production revalidation URL is configured", () => {
    expect(() =>
      getRevalidateApiBaseUrl({
        NODE_ENV: "production",
      }),
    ).toThrow(
      "FRONTEND_REVALIDATE_URL or STORE_URL or NEXT_PUBLIC_STORE_URL is not set in environment variables.",
    );
  });
});
