import type { SocialPostMedia } from "@konfi/types";
import { metaGraphFetch, type MetaClientConfig } from "./meta-client";
import {
  PermanentProviderError,
  RetryableProviderError,
  type PublishResult,
} from "./types";

interface ContainerCreateResponse {
  id: string;
}

interface ContainerStatusResponse {
  status_code: string;
}

interface MediaPublishResponse {
  id: string;
}

const CONTAINER_POLL_INTERVAL_MS = 3000;
const CONTAINER_POLL_MAX_ATTEMPTS = 10;
const CAROUSEL_CHILD_CONTAINER_CONCURRENCY = 4;

async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  mapper: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];

      if (item === undefined) {
        throw new Error(`Missing item at index ${index}.`);
      }

      results[index] = await mapper(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

/**
 * Poll a media container until it reaches FINISHED status.
 * Throws RetryableProviderError on timeout, PermanentProviderError on ERROR.
 */
async function pollContainerUntilFinished({
  graphApiVersion,
  containerId,
  accessToken,
}: MetaClientConfig & {
  containerId: string;
  accessToken: string;
}): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONTAINER_POLL_INTERVAL_MS),
      );
    }

    const status = await metaGraphFetch<ContainerStatusResponse>({
      graphApiVersion,
      path: containerId,
      method: "GET",
      accessToken,
      params: { fields: "status_code" },
    });

    if (status.status_code === "FINISHED") return;

    if (status.status_code === "ERROR") {
      throw new PermanentProviderError(
        `Instagram container ${containerId} finished with ERROR status.`,
      );
    }
    // IN_PROGRESS / PUBLISHED / other → keep polling
  }

  throw new RetryableProviderError(
    `Instagram container ${containerId} did not reach FINISHED after ${CONTAINER_POLL_MAX_ATTEMPTS} attempts.`,
  );
}

/**
 * Publish content to an Instagram Business Account.
 * Requires at least one image (throws PermanentProviderError otherwise).
 *
 * - 1 image   → single container → media_publish
 * - 2+ images → carousel (per-image containers + CAROUSEL container) → media_publish
 */
export async function publishToInstagram({
  graphApiVersion,
  igUserId,
  userToken,
  content,
  media,
}: MetaClientConfig & {
  igUserId: string;
  userToken: string;
  content: string;
  media: SocialPostMedia[];
}): Promise<PublishResult> {
  const imageMedia = media.filter((m) => m.contentType.startsWith("image/"));

  if (imageMedia.length === 0) {
    throw new PermanentProviderError(
      "Instagram requires at least one image to publish.",
    );
  }

  if (imageMedia.length === 1) {
    // Single-image post
    const container = await metaGraphFetch<ContainerCreateResponse>({
      graphApiVersion,
      path: `${igUserId}/media`,
      method: "POST",
      accessToken: userToken,
      body: { image_url: imageMedia[0].downloadUrl, caption: content },
    });

    await pollContainerUntilFinished({
      graphApiVersion,
      containerId: container.id,
      accessToken: userToken,
    });

    const result = await metaGraphFetch<MediaPublishResponse>({
      graphApiVersion,
      path: `${igUserId}/media_publish`,
      method: "POST",
      accessToken: userToken,
      body: { creation_id: container.id },
    });

    return { externalPostId: result.id };
  }

  // Carousel post
  const childContainerIds = await mapWithConcurrency(
    imageMedia,
    CAROUSEL_CHILD_CONTAINER_CONCURRENCY,
    async (img) => {
      const child = await metaGraphFetch<ContainerCreateResponse>({
        graphApiVersion,
        path: `${igUserId}/media`,
        method: "POST",
        accessToken: userToken,
        body: { image_url: img.downloadUrl, is_carousel_item: true },
      });

      await pollContainerUntilFinished({
        graphApiVersion,
        containerId: child.id,
        accessToken: userToken,
      });

      return child.id;
    },
  );

  const carousel = await metaGraphFetch<ContainerCreateResponse>({
    graphApiVersion,
    path: `${igUserId}/media`,
    method: "POST",
    accessToken: userToken,
    body: {
      media_type: "CAROUSEL",
      children: childContainerIds.join(","),
      caption: content,
    },
  });

  await pollContainerUntilFinished({
    graphApiVersion,
    containerId: carousel.id,
    accessToken: userToken,
  });

  const result = await metaGraphFetch<MediaPublishResponse>({
    graphApiVersion,
    path: `${igUserId}/media_publish`,
    method: "POST",
    accessToken: userToken,
    body: { creation_id: carousel.id },
  });

  return { externalPostId: result.id };
}
