import { describe, expect, it, vi, afterEach } from "vitest";
import { PermanentProviderError, RetryableProviderError } from "./types";

vi.mock("server-only", () => ({}));

// We test the fetch-level classification by mocking global fetch.

const { metaGraphFetch } = await import("./meta-client");

function makeJsonResponse(
  body: unknown,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const graphApiVersion = "v23.0";

describe("metaGraphFetch error classification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed body on 200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({ id: "post-123" }, 200),
    );

    const result = await metaGraphFetch<{ id: string }>({
      graphApiVersion,
      path: "me/feed",
      method: "POST",
      accessToken: "token",
      body: { message: "hello" },
    });

    expect(result.id).toBe("post-123");

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    // Token must NOT appear in the URL
    expect(calledUrl).not.toContain("access_token");
    // Authorization header must be present
    const headers = calledInit?.headers as Record<string, string> | undefined;
    expect(headers?.["Authorization"]).toBe("Bearer token");
    // JSON body branch must also include Content-Type
    expect(headers?.["Content-Type"]).toBe("application/json");
  });

  it("uses Authorization header for GET requests with no body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({ name: "My Page" }, 200),
    );

    await metaGraphFetch({
      graphApiVersion,
      path: "me",
      method: "GET",
      accessToken: "my-access-token",
    });

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).not.toContain("access_token");
    const headers = calledInit?.headers as Record<string, string> | undefined;
    expect(headers?.["Authorization"]).toBe("Bearer my-access-token");
  });

  it("throws PermanentProviderError with tokenExpired on code 190", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse(
        { error: { message: "Invalid OAuth", code: 190 } },
        400,
      ),
    );

    await expect(
      metaGraphFetch({ graphApiVersion, path: "me", method: "GET", accessToken: "bad" }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof PermanentProviderError && e.tokenExpired === true,
    );
  });

  it("throws RetryableProviderError on rate-limit code 4", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse(
        { error: { message: "Rate limit", code: 4 } },
        400,
      ),
    );

    await expect(
      metaGraphFetch({ graphApiVersion, path: "me", method: "GET", accessToken: "t" }),
    ).rejects.toBeInstanceOf(RetryableProviderError);
  });

  it("throws RetryableProviderError on rate-limit codes 17, 32, 613", async () => {
    for (const code of [17, 32, 613]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        makeJsonResponse({ error: { message: "Rate limit", code } }, 400),
      );

      await expect(
        metaGraphFetch({ graphApiVersion, path: "me", method: "GET", accessToken: "t" }),
      ).rejects.toBeInstanceOf(RetryableProviderError);
    }
  });

  it("throws RetryableProviderError on HTTP 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({}, 429),
    );

    await expect(
      metaGraphFetch({ graphApiVersion, path: "me", method: "GET", accessToken: "t" }),
    ).rejects.toBeInstanceOf(RetryableProviderError);
  });

  it("throws RetryableProviderError on HTTP 503", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({}, 503),
    );

    await expect(
      metaGraphFetch({ graphApiVersion, path: "me", method: "GET", accessToken: "t" }),
    ).rejects.toBeInstanceOf(RetryableProviderError);
  });

  it("throws PermanentProviderError on other 4xx errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse(
        { error: { message: "Bad request", code: 100 } },
        400,
      ),
    );

    const err = await metaGraphFetch({
      graphApiVersion,
      path: "me",
      method: "GET",
      accessToken: "t",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PermanentProviderError);
    expect((err as PermanentProviderError).tokenExpired).toBeUndefined();
  });
});
