import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { publishToFacebookPage } = await import("./facebook");

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeferredResponse(): {
  promise: Promise<Response>;
  resolve: (value: Response) => void;
} {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

const cfg = { graphApiVersion: "v23.0" };

describe("publishToFacebookPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to /feed when there are no images", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ id: "feed-post-1" }));

    const result = await publishToFacebookPage({
      ...cfg,
      pageId: "page-1",
      pageToken: "pt",
      content: "Hello FB",
      media: [],
    });

    expect(result.externalPostId).toBe("feed-post-1");
    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.pathname).toContain("/page-1/feed");
  });

  it("posts to /photos when there is one image", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({ id: "photo-1" }),
    );

    const result = await publishToFacebookPage({
      ...cfg,
      pageId: "page-1",
      pageToken: "pt",
      content: "Photo post",
      media: [
        {
          storagePath: "p",
          downloadUrl: "https://img/1.jpg",
          contentType: "image/jpeg",
        },
      ],
    });

    expect(result.externalPostId).toBe("photo-1");
  });

  it("uploads each image unpublished then posts to /feed for multi-image", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // Two photo uploads
      .mockResolvedValueOnce(makeJsonResponse({ id: "ph-1" }))
      .mockResolvedValueOnce(makeJsonResponse({ id: "ph-2" }))
      // Feed post
      .mockResolvedValueOnce(makeJsonResponse({ id: "feed-multi" }));

    const result = await publishToFacebookPage({
      ...cfg,
      pageId: "page-1",
      pageToken: "pt",
      content: "Multi",
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

    expect(result.externalPostId).toBe("feed-multi");
    // 2 photo uploads + 1 feed = 3 calls
    expect(fetchSpy.mock.calls).toHaveLength(3);

    // Third call should include attached_media
    const feedBody = JSON.parse(
      (fetchSpy.mock.calls[2][1] as RequestInit).body as string,
    ) as { attached_media: unknown[] };
    expect(feedBody.attached_media).toHaveLength(2);
  });

  it("starts multi-image unpublished uploads concurrently", async () => {
    const firstPhoto = createDeferredResponse();
    const secondPhoto = createDeferredResponse();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(firstPhoto.promise)
      .mockReturnValueOnce(secondPhoto.promise)
      .mockResolvedValueOnce(makeJsonResponse({ id: "feed-multi" }));

    const publishPromise = publishToFacebookPage({
      ...cfg,
      pageId: "page-1",
      pageToken: "pt",
      content: "Multi",
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

    expect(fetchSpy.mock.calls).toHaveLength(2);
    expect(new URL(fetchSpy.mock.calls[0][0] as string).pathname).toContain(
      "/page-1/photos",
    );
    expect(new URL(fetchSpy.mock.calls[1][0] as string).pathname).toContain(
      "/page-1/photos",
    );

    firstPhoto.resolve(makeJsonResponse({ id: "ph-1" }));
    secondPhoto.resolve(makeJsonResponse({ id: "ph-2" }));

    await expect(publishPromise).resolves.toEqual({
      externalPostId: "feed-multi",
    });
    expect(fetchSpy.mock.calls).toHaveLength(3);

    const feedBody = JSON.parse(
      (fetchSpy.mock.calls[2][1] as RequestInit).body as string,
    ) as { attached_media: { media_fbid: string }[] };
    expect(feedBody.attached_media).toEqual([
      { media_fbid: "ph-1" },
      { media_fbid: "ph-2" },
    ]);
  });
});
