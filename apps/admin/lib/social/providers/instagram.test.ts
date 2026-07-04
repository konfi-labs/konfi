import { afterEach, describe, expect, it, vi } from "vitest";
import { PermanentProviderError, RetryableProviderError } from "./types";

vi.mock("server-only", () => ({}));

const { publishToInstagram } = await import("./instagram");

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readJsonBody(init?: RequestInit): Record<string, unknown> | undefined {
  if (typeof init?.body !== "string") return undefined;
  return JSON.parse(init.body) as Record<string, unknown>;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

const cfg = { graphApiVersion: "v23.0" };
const base = { igUserId: "ig-123", userToken: "ut", content: "Caption" };

describe("publishToInstagram", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws PermanentProviderError when no images provided", async () => {
    await expect(
      publishToInstagram({ ...cfg, ...base, media: [] }),
    ).rejects.toBeInstanceOf(PermanentProviderError);
  });

  it("single image: create container → poll → publish", async () => {
    vi.spyOn(globalThis, "fetch")
      // Create container
      .mockResolvedValueOnce(makeJsonResponse({ id: "container-1" }))
      // Poll → FINISHED
      .mockResolvedValueOnce(makeJsonResponse({ status_code: "FINISHED" }))
      // Publish
      .mockResolvedValueOnce(makeJsonResponse({ id: "ig-post-1" }));

    const result = await publishToInstagram({
      ...cfg,
      ...base,
      media: [
        {
          storagePath: "p",
          downloadUrl: "https://img/1.jpg",
          contentType: "image/jpeg",
        },
      ],
    });

    expect(result.externalPostId).toBe("ig-post-1");
  });

  it("poll timeout throws RetryableProviderError", async () => {
    vi.spyOn(globalThis, "fetch")
      // Create container
      .mockResolvedValueOnce(makeJsonResponse({ id: "container-x" }))
      // All 10 polls return IN_PROGRESS
      .mockImplementation(() =>
        Promise.resolve(makeJsonResponse({ status_code: "IN_PROGRESS" })),
      );

    await expect(
      publishToInstagram({
        ...cfg,
        ...base,
        media: [
          {
            storagePath: "p",
            downloadUrl: "https://img/1.jpg",
            contentType: "image/jpeg",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(RetryableProviderError);
  }, 60_000); // allow poll loop to complete

  it("poll ERROR status throws PermanentProviderError", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ id: "container-err" }))
      .mockResolvedValueOnce(makeJsonResponse({ status_code: "ERROR" }));

    await expect(
      publishToInstagram({
        ...cfg,
        ...base,
        media: [
          {
            storagePath: "p",
            downloadUrl: "https://img/1.jpg",
            contentType: "image/jpeg",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(PermanentProviderError);
  });

  it("carousel: uploads each item, creates carousel container, publishes", async () => {
    const childIds = ["child-1", "child-2"];
    let childCreateIndex = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, init) => {
        const body = readJsonBody(init);
        const path = String(url);

        if (init?.method === "POST" && body?.is_carousel_item === true) {
          return Promise.resolve(
            makeJsonResponse({ id: childIds[childCreateIndex++] }),
          );
        }

        if (init?.method === "GET" && path.includes("/child-")) {
          return Promise.resolve(makeJsonResponse({ status_code: "FINISHED" }));
        }

        if (init?.method === "POST" && body?.media_type === "CAROUSEL") {
          return Promise.resolve(makeJsonResponse({ id: "carousel-1" }));
        }

        if (init?.method === "GET" && path.includes("/carousel-1")) {
          return Promise.resolve(makeJsonResponse({ status_code: "FINISHED" }));
        }

        if (init?.method === "POST" && path.includes("/media_publish")) {
          return Promise.resolve(makeJsonResponse({ id: "ig-carousel-post" }));
        }

        return Promise.reject(
          new Error(`Unexpected Graph API request: ${init?.method} ${path}`),
        );
      });

    const result = await publishToInstagram({
      ...cfg,
      ...base,
      media: [
        {
          storagePath: "a",
          downloadUrl: "https://img/1.jpg",
          contentType: "image/jpeg",
        },
        {
          storagePath: "b",
          downloadUrl: "https://img/2.jpg",
          contentType: "image/jpeg",
        },
      ],
    });

    expect(result.externalPostId).toBe("ig-carousel-post");
    expect(fetchSpy.mock.calls).toHaveLength(7);
    const carouselCreateCall = fetchSpy.mock.calls.find(([, init]) => {
      const body = readJsonBody(init);
      return init?.method === "POST" && body?.media_type === "CAROUSEL";
    });
    expect(carouselCreateCall).toBeDefined();

    if (!carouselCreateCall) {
      throw new Error("Expected carousel container create request.");
    }

    expect(readJsonBody(carouselCreateCall[1])?.children).toBe(
      "child-1,child-2",
    );
  });

  it("carousel: starts child container creation without waiting for earlier child polling", async () => {
    const firstChildPoll = deferred<Response>();
    const childIds = ["child-1", "child-2"];
    let childCreateIndex = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, init) => {
        const body = readJsonBody(init);
        const path = String(url);

        if (init?.method === "POST" && body?.is_carousel_item === true) {
          return Promise.resolve(
            makeJsonResponse({ id: childIds[childCreateIndex++] }),
          );
        }

        if (init?.method === "GET" && path.includes("/child-1")) {
          return firstChildPoll.promise;
        }

        if (init?.method === "GET" && path.includes("/child-2")) {
          return Promise.resolve(makeJsonResponse({ status_code: "FINISHED" }));
        }

        if (init?.method === "POST" && body?.media_type === "CAROUSEL") {
          return Promise.resolve(makeJsonResponse({ id: "carousel-1" }));
        }

        if (init?.method === "GET" && path.includes("/carousel-1")) {
          return Promise.resolve(makeJsonResponse({ status_code: "FINISHED" }));
        }

        if (init?.method === "POST" && path.includes("/media_publish")) {
          return Promise.resolve(makeJsonResponse({ id: "ig-carousel-post" }));
        }

        return Promise.reject(
          new Error(`Unexpected Graph API request: ${init?.method} ${path}`),
        );
      });

    const publishPromise = publishToInstagram({
      ...cfg,
      ...base,
      media: [
        {
          storagePath: "a",
          downloadUrl: "https://img/1.jpg",
          contentType: "image/jpeg",
        },
        {
          storagePath: "b",
          downloadUrl: "https://img/2.jpg",
          contentType: "image/jpeg",
        },
      ],
    });

    await vi.waitFor(() => {
      const childCreateCalls = fetchSpy.mock.calls.filter(([, init]) => {
        return readJsonBody(init)?.is_carousel_item === true;
      });
      expect(childCreateCalls).toHaveLength(2);
      expect(
        fetchSpy.mock.calls.some(([url, init]) => {
          return init?.method === "GET" && String(url).includes("/child-1");
        }),
      ).toBe(true);
    });

    const secondChildCreateIndex = fetchSpy.mock.calls.findIndex(([, init]) => {
      return readJsonBody(init)?.image_url === "https://img/2.jpg";
    });
    const firstChildPollIndex = fetchSpy.mock.calls.findIndex(([url, init]) => {
      return init?.method === "GET" && String(url).includes("/child-1");
    });

    expect(secondChildCreateIndex).toBeGreaterThan(-1);
    expect(firstChildPollIndex).toBeGreaterThan(-1);
    expect(secondChildCreateIndex).toBeLessThan(firstChildPollIndex);

    firstChildPoll.resolve(makeJsonResponse({ status_code: "FINISHED" }));

    await expect(publishPromise).resolves.toEqual({
      externalPostId: "ig-carousel-post",
    });
  });

  it("carousel: limits child container creation and polling concurrency", async () => {
    const childIds = Array.from({ length: 5 }, (_, index) => {
      return `child-${index + 1}`;
    });
    const childPolls = childIds.map(() => deferred<Response>());
    let childCreateIndex = 0;
    let activePolls = 0;
    let maxActivePolls = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url, init) => {
        const body = readJsonBody(init);
        const path = String(url);

        if (init?.method === "POST" && body?.is_carousel_item === true) {
          const childId = childIds[childCreateIndex];

          if (childId === undefined) {
            return Promise.reject(
              new Error("Unexpected child create request."),
            );
          }

          childCreateIndex += 1;
          return Promise.resolve(makeJsonResponse({ id: childId }));
        }

        if (init?.method === "GET" && path.includes("/child-")) {
          const childId = childIds.find((id) => path.includes(`/${id}`));
          const poll = childPolls[childIds.indexOf(childId ?? "")];

          if (!poll) {
            return Promise.reject(
              new Error(`Unexpected child poll request: ${path}`),
            );
          }

          activePolls += 1;
          maxActivePolls = Math.max(maxActivePolls, activePolls);
          return poll.promise.finally(() => {
            activePolls -= 1;
          });
        }

        if (init?.method === "POST" && body?.media_type === "CAROUSEL") {
          return Promise.resolve(makeJsonResponse({ id: "carousel-1" }));
        }

        if (init?.method === "GET" && path.includes("/carousel-1")) {
          return Promise.resolve(makeJsonResponse({ status_code: "FINISHED" }));
        }

        if (init?.method === "POST" && path.includes("/media_publish")) {
          return Promise.resolve(makeJsonResponse({ id: "ig-carousel-post" }));
        }

        return Promise.reject(
          new Error(`Unexpected Graph API request: ${init?.method} ${path}`),
        );
      });

    const publishPromise = publishToInstagram({
      ...cfg,
      ...base,
      media: childIds.map((id) => ({
        storagePath: id,
        downloadUrl: `https://img/${id}.jpg`,
        contentType: "image/jpeg",
      })),
    });

    await vi.waitFor(() => {
      const childCreateCalls = fetchSpy.mock.calls.filter(([, init]) => {
        return readJsonBody(init)?.is_carousel_item === true;
      });
      expect(childCreateCalls).toHaveLength(4);
    });

    await vi.waitFor(() => expect(maxActivePolls).toBe(4));

    const firstChildPoll = childPolls[0];

    if (!firstChildPoll) {
      throw new Error("Expected first child poll.");
    }

    firstChildPoll.resolve(makeJsonResponse({ status_code: "FINISHED" }));

    await vi.waitFor(() => {
      const childCreateCalls = fetchSpy.mock.calls.filter(([, init]) => {
        return readJsonBody(init)?.is_carousel_item === true;
      });
      expect(childCreateCalls).toHaveLength(5);
    });

    for (const poll of childPolls.slice(1)) {
      poll.resolve(makeJsonResponse({ status_code: "FINISHED" }));
    }

    await expect(publishPromise).resolves.toEqual({
      externalPostId: "ig-carousel-post",
    });
  });
});
