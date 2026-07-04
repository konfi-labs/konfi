import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { getTenantAdminScopeTenantId } from "@/actions/auth-utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type {
  SocialPost,
  SocialPostMedia,
  SocialPostStatus,
  SocialProviderKey,
} from "@konfi/types";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const SOCIAL_POSTS_COLLECTION = "socialPosts";

/** Facebook post content limit (characters) */
const FB_CONTENT_MAX = 63206;
/** Instagram caption limit (characters) */
const IG_CAPTION_MAX = 2200;

// ──────────────────────────────────────────────────────────────────────────────
// Input shapes (internal, not exported to clients)
// ──────────────────────────────────────────────────────────────────────────────

export interface PostTarget {
  provider: SocialProviderKey;
  targetId: string;
  targetName: string;
}

export interface CreatePostInput {
  tenantContext: TenantContext;
  member: { id: string; name: string };
  channelId?: string;
  content: string;
  media: SocialPostMedia[];
  targets: PostTarget[];
}

export interface UpdatePostInput {
  member: { id: string; name: string };
  content: string;
  media: SocialPostMedia[];
  targets: PostTarget[];
  channelId?: string;
}

export interface ListPostsFilter {
  from?: number; // ms epoch
  to?: number; // ms epoch
  statuses?: SocialPostStatus[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateSocialPost(post: {
  content: string;
  media: SocialPostMedia[];
  targets: PostTarget[];
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const hasMedia = post.media.length > 0;
  const hasContent = post.content.trim().length > 0;

  // Content must be present unless at least one media item exists
  if (!hasContent && !hasMedia) {
    issues.push({ field: "content", message: "Content is required when no media is provided." });
  }

  for (const target of post.targets) {
    if (target.provider === "instagram") {
      const imageMedia = post.media.filter((m) =>
        m.contentType.startsWith("image/"),
      );
      if (imageMedia.length === 0) {
        issues.push({
          field: "targets",
          message: "Instagram targets require at least one image media item.",
        });
        break; // one message is enough
      }
    }

    if (target.provider === "facebook" && post.content.length > FB_CONTENT_MAX) {
      issues.push({
        field: "content",
        message: `Facebook content exceeds the ${FB_CONTENT_MAX}-character limit.`,
      });
    }

    if (target.provider === "instagram" && post.content.length > IG_CAPTION_MAX) {
      issues.push({
        field: "content",
        message: `Instagram caption exceeds the ${IG_CAPTION_MAX}-character limit.`,
      });
    }
  }

  return issues;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function deriveName(content: string): string {
  return content.trim().slice(0, 40) || "Post";
}

function editableStatuses(): SocialPostStatus[] {
  return ["draft", "scheduled"];
}

function isEditable(status: SocialPostStatus): boolean {
  return (editableStatuses() as string[]).includes(status);
}

function getTenantFilter(tenantContext: TenantContext): string | undefined {
  return getTenantAdminScopeTenantId(tenantContext);
}

// ──────────────────────────────────────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────────────────────────────────────

export async function createPost(input: CreatePostInput): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection(SOCIAL_POSTS_COLLECTION).doc();
  const tenantId = getTenantFilter(input.tenantContext);
  const now = FieldValue.serverTimestamp();

  const doc: Omit<SocialPost, "id"> & { id: string } = {
    id: ref.id,
    name: deriveName(input.content),
    active: true,
    createdBy: input.member,
    updatedBy: input.member,
    createdAt: now as SocialPost["createdAt"],
    updatedAt: now as SocialPost["updatedAt"],
    ...(tenantId ? { tenantId } : {}),
    ...(input.channelId ? { channelId: input.channelId } : {}),
    content: input.content,
    media: input.media,
    targets: input.targets.map((t) => ({
      provider: t.provider,
      targetId: t.targetId,
      targetName: t.targetName,
      status: "pending" as const,
    })),
    status: "draft" as const,
  };

  await ref.set(doc);
  return ref.id;
}

export async function getPost(
  id: string,
  tenantContext: TenantContext,
): Promise<SocialPost | undefined> {
  const snap = await getAdminDb()
    .collection(SOCIAL_POSTS_COLLECTION)
    .doc(id)
    .get();

  if (!snap.exists) return undefined;

  const data = snap.data() as SocialPost;
  const tenantId = getTenantFilter(tenantContext);

  if (tenantId && data.tenantId !== tenantId) return undefined;

  return { ...data, id: snap.id };
}

export async function updatePost(
  id: string,
  tenantContext: TenantContext,
  input: UpdatePostInput,
): Promise<void> {
  const existing = await getPost(id, tenantContext);
  if (!existing) throw new Error("Post not found.");

  if (!isEditable(existing.status)) {
    throw new Error(
      `Post cannot be edited while in status "${existing.status}".`,
    );
  }

  const patch: Partial<SocialPost> = {
    name: deriveName(input.content),
    content: input.content,
    media: input.media,
    targets: input.targets.map((t) => ({
      provider: t.provider,
      targetId: t.targetId,
      targetName: t.targetName,
      status: "pending" as const,
    })),
    ...(input.channelId !== undefined
      ? { channelId: input.channelId }
      : {}),
    updatedBy: input.member,
    updatedAt: FieldValue.serverTimestamp() as SocialPost["updatedAt"],
  };

  await getAdminDb()
    .collection(SOCIAL_POSTS_COLLECTION)
    .doc(id)
    .update(patch);
}

export async function setPostSchedule(
  id: string,
  tenantContext: TenantContext,
  scheduledAt: Date,
  member: { id: string; name: string },
): Promise<void> {
  const existing = await getPost(id, tenantContext);
  if (!existing) throw new Error("Post not found.");

  if (!isEditable(existing.status)) {
    throw new Error(
      `Post cannot be scheduled while in status "${existing.status}".`,
    );
  }

  await getAdminDb()
    .collection(SOCIAL_POSTS_COLLECTION)
    .doc(id)
    .update({
      status: "scheduled" as SocialPostStatus,
      scheduledAt: Timestamp.fromDate(scheduledAt),
      updatedBy: member,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function cancelSchedule(
  id: string,
  tenantContext: TenantContext,
  member: { id: string; name: string },
): Promise<void> {
  const existing = await getPost(id, tenantContext);
  if (!existing) throw new Error("Post not found.");

  if (existing.status !== "scheduled") {
    throw new Error(
      `Only scheduled posts can be cancelled (current status: "${existing.status}").`,
    );
  }

  await getAdminDb()
    .collection(SOCIAL_POSTS_COLLECTION)
    .doc(id)
    .update({
      status: "draft" as SocialPostStatus,
      scheduledAt: FieldValue.delete(),
      updatedBy: member,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Hard-deletes the post document.
 * Follows the repo-dominant convention (channels, external-products) of a
 * direct Firestore `.delete()` rather than soft-deactivation.
 */
export async function deletePost(
  id: string,
  tenantContext: TenantContext,
): Promise<void> {
  const existing = await getPost(id, tenantContext);
  if (!existing) throw new Error("Post not found.");

  await getAdminDb().collection(SOCIAL_POSTS_COLLECTION).doc(id).delete();
}

// ──────────────────────────────────────────────────────────────────────────────
// Publishing engine helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Atomically claim posts that are due to be published.
 * Only posts with status "scheduled" and scheduledAt <= now are claimed.
 * Each claimed post is immediately moved to "publishing" with a publishStartedAt
 * timestamp, acting as a double-publish guard.
 */
export async function claimDuePosts(
  tenantContext: TenantContext,
  opts?: { limit?: number },
): Promise<SocialPost[]> {
  const db = getAdminDb();
  const tenantId = getTenantFilter(tenantContext);
  const limit = opts?.limit ?? 25;
  const now = Timestamp.now();

  return db.runTransaction(async (tx) => {
    let query: FirebaseFirestore.Query = db
      .collection(SOCIAL_POSTS_COLLECTION)
      .where("status", "==", "scheduled")
      .where("scheduledAt", "<=", now)
      .limit(limit);

    if (tenantId) {
      query = query.where("tenantId", "==", tenantId);
    }

    const snapshot = await tx.get(query);

    const claimed: SocialPost[] = [];

    for (const doc of snapshot.docs) {
      const ref = db.collection(SOCIAL_POSTS_COLLECTION).doc(doc.id);
      tx.update(ref, {
        status: "publishing" as SocialPostStatus,
        publishStartedAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
      claimed.push({ ...(doc.data() as SocialPost), id: doc.id });
    }

    return claimed;
  });
}

/**
 * Record the outcome of a single publish target within a post.
 * Updates the matching entry in the targets array in place (read-modify-write).
 */
export async function recordTargetResult(
  postId: string,
  tenantContext: TenantContext,
  targetId: string,
  result: {
    status: "published" | "failed";
    externalPostId?: string;
    error?: string;
  },
): Promise<void> {
  const post = await getPost(postId, tenantContext);
  if (!post) throw new Error(`Post ${postId} not found.`);

  const now = Timestamp.now();

  const updatedTargets = post.targets.map((t) => {
    if (t.targetId !== targetId) return t;
    if (result.status === "published") {
      return {
        ...t,
        status: "published" as const,
        externalPostId: result.externalPostId,
        publishedAt: now,
      };
    }
    return {
      ...t,
      status: "failed" as const,
      error: result.error,
    };
  });

  await getAdminDb()
    .collection(SOCIAL_POSTS_COLLECTION)
    .doc(postId)
    .update({
      targets: updatedTargets,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Derive and write the final aggregate status from target outcomes.
 * all published → "published"; some → "partial"; none → "failed".
 */
export async function finalizePost(
  postId: string,
  tenantContext: TenantContext,
): Promise<void> {
  const post = await getPost(postId, tenantContext);
  if (!post) throw new Error(`Post ${postId} not found.`);

  const publishedCount = post.targets.filter((t) => t.status === "published").length;
  const total = post.targets.length;

  let finalStatus: SocialPostStatus;
  if (total === 0 || publishedCount === 0) {
    finalStatus = "failed";
  } else if (publishedCount === total) {
    finalStatus = "published";
  } else {
    finalStatus = "partial";
  }

  await getAdminDb()
    .collection(SOCIAL_POSTS_COLLECTION)
    .doc(postId)
    .update({
      status: finalStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function listPosts(
  tenantContext: TenantContext,
  filter?: ListPostsFilter,
): Promise<SocialPost[]> {
  const db = getAdminDb();
  const tenantId = getTenantFilter(tenantContext);

  let query: FirebaseFirestore.Query = db.collection(SOCIAL_POSTS_COLLECTION);

  if (tenantId) {
    query = query.where("tenantId", "==", tenantId);
  }

  if (filter?.statuses && filter.statuses.length > 0) {
    query = query.where("status", "in", filter.statuses);
  }

  if (filter?.from !== undefined) {
    query = query.where(
      "scheduledAt",
      ">=",
      Timestamp.fromMillis(filter.from),
    );
  }

  if (filter?.to !== undefined) {
    query = query.where("scheduledAt", "<=", Timestamp.fromMillis(filter.to));
  }

  query = query.orderBy("scheduledAt", "asc");

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ ...(doc.data() as SocialPost), id: doc.id }));
}
