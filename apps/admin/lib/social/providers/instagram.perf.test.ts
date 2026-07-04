import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { publishToInstagram } = await import("./instagram");

function makeJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cfg = { graphApiVersion: "v23.0" };
const base = { igUserId: "ig-123", userToken: "ut", content: "Caption" };
const describePerf =
  process.env.KONFI_RUN_PERF_TESTS === "1" ? describe : describe.skip;

describePerf("publishToInstagram carousel mocked-latency benchmark", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records elapsed time for a four-image carousel", async () => {
    const childIds = ["child-1", "child-2", "child-3", "child-4"];
    let childCreateIndex = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      await delay(25);

      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      const path = String(url);

      if (init?.method === "POST" && body?.is_carousel_item === true) {
        return makeJsonResponse({ id: childIds[childCreateIndex++] });
      }

      if (init?.method === "GET" && path.includes("/child-")) {
        return makeJsonResponse({ status_code: "FINISHED" });
      }

      if (init?.method === "POST" && body?.media_type === "CAROUSEL") {
        return makeJsonResponse({ id: "carousel-1" });
      }

      if (init?.method === "GET" && path.includes("/carousel-1")) {
        return makeJsonResponse({ status_code: "FINISHED" });
      }

      if (init?.method === "POST" && path.includes("/media_publish")) {
        return makeJsonResponse({ id: "ig-carousel-post" });
      }

      throw new Error(`Unexpected Graph API request: ${init?.method} ${path}`);
    });

    const startedAt = performance.now();
    const result = await publishToInstagram({
      ...cfg,
      ...base,
      media: childIds.map((id) => ({
        storagePath: id,
        downloadUrl: `https://img/${id}.jpg`,
        contentType: "image/jpeg",
      })),
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.externalPostId).toBe("ig-carousel-post");
    expect(elapsedMs).toBeGreaterThan(0);
  });
});
